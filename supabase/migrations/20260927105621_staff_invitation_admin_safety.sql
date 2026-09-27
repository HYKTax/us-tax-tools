create or replace function public.revoke_staff_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_inv staff_invitations;
  v_target profiles;
  v_other_admins integer;
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

  if v_inv.auth_user_id = v_actor.id then
    raise exception 'You cannot revoke your own administrator invitation';
  end if;

  if v_inv.auth_user_id is not null then
    select * into v_target
    from profiles
    where id = v_inv.auth_user_id
      and firm_id = v_actor.firm_id
      and role in ('firm_admin','firm_staff')
    for update;

    if v_target.id is not null and v_target.role = 'firm_admin' and v_target.is_active then
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
