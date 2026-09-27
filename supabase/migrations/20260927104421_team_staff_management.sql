alter table public.profiles
  add column if not exists is_active boolean not null default true;

create or replace function private.is_firm_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and role in ('firm_admin', 'firm_staff')
      and is_active
  );
$$;

create or replace function private.is_firm_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and role = 'firm_admin'
      and is_active
  );
$$;

drop policy if exists "profiles_update_self" on public.profiles;
revoke update on public.profiles from authenticated;

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  email text not null,
  full_name text not null,
  role profile_role not null check (role in ('firm_admin','firm_staff')),
  status text not null default 'invited' check (status in ('invited','accepted','revoked')),
  auth_user_id uuid references auth.users(id) on delete set null,
  invited_by uuid not null references public.profiles(id),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index staff_invitations_firm_email_idx
  on public.staff_invitations(firm_id, lower(email));
create index staff_invitations_firm_status_idx
  on public.staff_invitations(firm_id, status);
create index staff_invitations_auth_user_idx
  on public.staff_invitations(auth_user_id);
create index staff_invitations_invited_by_idx
  on public.staff_invitations(invited_by);

create trigger staff_invitations_set_updated_at
before update on public.staff_invitations
for each row execute function private.set_updated_at();

alter table public.staff_invitations enable row level security;

create policy "staff_invitations_admin_select"
on public.staff_invitations
for select
to authenticated
using (
  private.is_firm_admin()
  and firm_id = private.current_firm_id()
);

create policy "staff_invitations_admin_insert"
on public.staff_invitations
for insert
to authenticated
with check (
  private.is_firm_admin()
  and firm_id = private.current_firm_id()
  and invited_by = (select auth.uid())
  and role in ('firm_admin','firm_staff')
);

create policy "staff_invitations_admin_update"
on public.staff_invitations
for update
to authenticated
using (
  private.is_firm_admin()
  and firm_id = private.current_firm_id()
)
with check (
  private.is_firm_admin()
  and firm_id = private.current_firm_id()
  and role in ('firm_admin','firm_staff')
);

revoke all on public.staff_invitations from anon, authenticated;
grant select, insert, update on public.staff_invitations to authenticated;

create or replace function public.admin_update_staff(
  p_profile_id uuid,
  p_role profile_role,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_target profiles;
  v_other_admins integer;
begin
  select * into v_actor from profiles where id = auth.uid();

  if v_actor.id is null or v_actor.role <> 'firm_admin' or not v_actor.is_active then
    raise exception 'Only an active firm administrator can manage staff';
  end if;

  if p_role not in ('firm_admin','firm_staff') then
    raise exception 'Invalid staff role';
  end if;

  select * into v_target
  from profiles
  where id = p_profile_id
    and firm_id = v_actor.firm_id
    and role in ('firm_admin','firm_staff')
  for update;

  if v_target.id is null then
    raise exception 'Staff member not found';
  end if;

  if v_target.id = v_actor.id and (p_role <> 'firm_admin' or not p_is_active) then
    raise exception 'You cannot remove your own administrator access';
  end if;

  if v_target.role = 'firm_admin'
     and v_target.is_active
     and (p_role <> 'firm_admin' or not p_is_active) then
    select count(*) into v_other_admins
    from profiles
    where firm_id = v_actor.firm_id
      and role = 'firm_admin'
      and is_active
      and id <> v_target.id;

    if v_other_admins = 0 then
      raise exception 'A firm must have at least one active administrator';
    end if;
  end if;

  update profiles
  set role = p_role,
      is_active = p_is_active
  where id = v_target.id;

  insert into audit_log(firm_id, actor_id, action, target_type, target_id, metadata)
  values (
    v_actor.firm_id,
    v_actor.id,
    'staff.updated',
    'profile',
    v_target.id,
    jsonb_build_object(
      'old_role', v_target.role,
      'new_role', p_role,
      'old_is_active', v_target.is_active,
      'new_is_active', p_is_active
    )
  );
end;
$$;

create or replace function public.revoke_staff_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_inv staff_invitations;
begin
  select * into v_actor from profiles where id = auth.uid();

  if v_actor.id is null or v_actor.role <> 'firm_admin' or not v_actor.is_active then
    raise exception 'Only an active firm administrator can revoke invitations';
  end if;

  select * into v_inv
  from staff_invitations
  where id = p_invitation_id
    and firm_id = v_actor.firm_id
  for update;

  if v_inv.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_inv.status = 'accepted' then
    raise exception 'Disable an active staff account instead of revoking its accepted invitation';
  end if;

  update staff_invitations
  set status = 'revoked',
      revoked_at = now()
  where id = v_inv.id;

  if v_inv.auth_user_id is not null then
    update profiles
    set is_active = false
    where id = v_inv.auth_user_id
      and firm_id = v_actor.firm_id
      and role in ('firm_admin','firm_staff');
  end if;

  insert into audit_log(firm_id, actor_id, action, target_type, target_id, metadata)
  values (
    v_actor.firm_id,
    v_actor.id,
    'staff.invitation_revoked',
    'staff_invitation',
    v_inv.id,
    jsonb_build_object('email', v_inv.email)
  );
end;
$$;

create or replace function public.mark_staff_invitation_accepted()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles;
  v_inv staff_invitations;
begin
  select * into v_profile
  from profiles
  where id = auth.uid();

  if v_profile.id is null or v_profile.role not in ('firm_admin','firm_staff') then
    return false;
  end if;

  select * into v_inv
  from staff_invitations
  where auth_user_id = v_profile.id
    and firm_id = v_profile.firm_id
    and status = 'invited'
  for update;

  if v_inv.id is null then
    return false;
  end if;

  update staff_invitations
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      revoked_at = null
  where id = v_inv.id;

  insert into audit_log(firm_id, actor_id, action, target_type, target_id, metadata)
  values (
    v_profile.firm_id,
    v_profile.id,
    'staff.invitation_accepted',
    'staff_invitation',
    v_inv.id,
    jsonb_build_object('email', v_inv.email)
  );

  return true;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firm_id uuid := nullif(new.raw_user_meta_data->>'firm_id','')::uuid;
  v_role profile_role := coalesce((new.raw_user_meta_data->>'role')::profile_role, 'client');
  v_invitation_id uuid := nullif(new.raw_user_meta_data->>'staff_invitation_id','')::uuid;
  v_inv staff_invitations;
begin
  if v_firm_id is null then
    raise exception 'Account is missing firm assignment';
  end if;

  if v_role in ('firm_admin','firm_staff') then
    if v_invitation_id is null then
      raise exception 'Staff account requires a valid invitation';
    end if;

    select * into v_inv
    from staff_invitations
    where id = v_invitation_id
      and firm_id = v_firm_id
      and lower(email) = lower(new.email)
      and role = v_role
      and status = 'invited'
    for update;

    if v_inv.id is null then
      raise exception 'Staff invitation is invalid or expired';
    end if;
  end if;

  insert into profiles (id, firm_id, role, full_name, email, is_active)
  values (
    new.id,
    v_firm_id,
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    true
  );

  if v_role = 'client' then
    update clients
    set profile_id = new.id,
        status = 'active'
    where firm_id = v_firm_id
      and lower(email) = lower(new.email)
      and profile_id is null;
  else
    update staff_invitations
    set auth_user_id = new.id,
        revoked_at = null
    where id = v_inv.id;
  end if;

  return new;
end;
$$;

revoke all on function private.is_firm_admin() from public, anon;
grant execute on function private.is_firm_admin() to authenticated;

revoke all on function public.admin_update_staff(uuid, profile_role, boolean) from public, anon;
grant execute on function public.admin_update_staff(uuid, profile_role, boolean) to authenticated;

revoke all on function public.revoke_staff_invitation(uuid) from public, anon;
grant execute on function public.revoke_staff_invitation(uuid) to authenticated;

revoke all on function public.mark_staff_invitation_accepted() from public, anon;
grant execute on function public.mark_staff_invitation_accepted() to authenticated;
