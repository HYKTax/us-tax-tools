create table if not exists public.client_tags (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists client_tags_firm_name_unique
  on public.client_tags(firm_id, lower(btrim(name)));
create index if not exists client_tags_created_by_idx
  on public.client_tags(created_by);

create table if not exists public.client_tag_assignments (
  tag_id uuid not null references public.client_tags(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  firm_id uuid not null references public.firms(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(tag_id, client_id)
);

create index if not exists client_tag_assignments_client_idx
  on public.client_tag_assignments(client_id, created_at desc);
create index if not exists client_tag_assignments_firm_idx
  on public.client_tag_assignments(firm_id);
create index if not exists client_tag_assignments_assigned_by_idx
  on public.client_tag_assignments(assigned_by);

alter table public.client_tags enable row level security;
alter table public.client_tag_assignments enable row level security;

drop policy if exists "client_tags_staff_select" on public.client_tags;
create policy "client_tags_staff_select"
on public.client_tags for select to authenticated
using (private.is_firm_staff() and firm_id = private.current_firm_id());

drop policy if exists "client_tags_staff_write" on public.client_tags;
create policy "client_tags_staff_write"
on public.client_tags for all to authenticated
using (
  private.has_staff_permission('clients.manage')
  and firm_id = private.current_firm_id()
)
with check (
  private.has_staff_permission('clients.manage')
  and firm_id = private.current_firm_id()
);

drop policy if exists "client_tag_assignments_staff_select" on public.client_tag_assignments;
create policy "client_tag_assignments_staff_select"
on public.client_tag_assignments for select to authenticated
using (private.is_firm_staff() and firm_id = private.current_firm_id());

drop policy if exists "client_tag_assignments_staff_write" on public.client_tag_assignments;
create policy "client_tag_assignments_staff_write"
on public.client_tag_assignments for all to authenticated
using (
  private.has_staff_permission('clients.manage')
  and firm_id = private.current_firm_id()
)
with check (
  private.has_staff_permission('clients.manage')
  and firm_id = private.current_firm_id()
  and assigned_by = (select auth.uid())
);

grant select, insert, update, delete on public.client_tags to authenticated;
grant select, insert, delete on public.client_tag_assignments to authenticated;

create or replace function private.validate_client_tag_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from client_tags t
    where t.id = new.tag_id and t.firm_id = new.firm_id
  ) then raise exception 'Tag must belong to the same firm'; end if;

  if not exists (
    select 1 from clients c
    where c.id = new.client_id and c.firm_id = new.firm_id
  ) then raise exception 'Client must belong to the same firm'; end if;

  if not exists (
    select 1 from profiles p
    where p.id = new.assigned_by and p.firm_id = new.firm_id
      and p.is_active and p.role in ('firm_admin','firm_staff')
  ) then raise exception 'Assigner must be active staff in the same firm'; end if;

  return new;
end;
$$;

drop trigger if exists client_tag_assignments_validate on public.client_tag_assignments;
create trigger client_tag_assignments_validate
before insert or update on public.client_tag_assignments
for each row execute function private.validate_client_tag_assignment();

create or replace function public.assign_client_tag(
  p_client_id uuid,
  p_name text
)
returns public.client_tags
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_tag client_tags;
  v_name text := btrim(p_name);
begin
  select * into v_actor from profiles where id = auth.uid() and is_active;

  if v_actor.id is null
     or not private.has_staff_permission('clients.manage') then
    raise exception 'Not authorized';
  end if;

  if length(v_name) < 1 or length(v_name) > 40 then
    raise exception 'Tag must be between 1 and 40 characters';
  end if;

  if not exists (
    select 1 from clients c
    where c.id = p_client_id and c.firm_id = v_actor.firm_id
  ) then raise exception 'Client not found'; end if;

  insert into client_tags(firm_id,name,created_by)
  values(v_actor.firm_id,v_name,v_actor.id)
  on conflict do nothing;

  select * into v_tag
  from client_tags t
  where t.firm_id = v_actor.firm_id
    and lower(btrim(t.name)) = lower(v_name)
  limit 1;

  insert into client_tag_assignments(tag_id,client_id,firm_id,assigned_by)
  values(v_tag.id,p_client_id,v_actor.firm_id,v_actor.id)
  on conflict(tag_id,client_id) do nothing;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_actor.firm_id,v_actor.id,'client.tag_assigned','client',p_client_id,
    jsonb_build_object('tag_id',v_tag.id,'tag_name',v_tag.name)
  );

  return v_tag;
end;
$$;

create or replace function public.remove_client_tag(
  p_client_id uuid,
  p_tag_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_tag client_tags;
begin
  select * into v_actor from profiles where id = auth.uid() and is_active;

  if v_actor.id is null
     or not private.has_staff_permission('clients.manage') then
    raise exception 'Not authorized';
  end if;

  select * into v_tag
  from client_tags
  where id = p_tag_id and firm_id = v_actor.firm_id;

  if v_tag.id is null then raise exception 'Tag not found'; end if;

  delete from client_tag_assignments
  where tag_id = p_tag_id
    and client_id = p_client_id
    and firm_id = v_actor.firm_id;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_actor.firm_id,v_actor.id,'client.tag_removed','client',p_client_id,
    jsonb_build_object('tag_id',v_tag.id,'tag_name',v_tag.name)
  );
end;
$$;

revoke all on function public.assign_client_tag(uuid,text),
  public.remove_client_tag(uuid,uuid),
  private.validate_client_tag_assignment()
from public, anon;

grant execute on function public.assign_client_tag(uuid,text),
  public.remove_client_tag(uuid,uuid)
to authenticated;
