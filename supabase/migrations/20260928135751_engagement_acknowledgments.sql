create table if not exists public.engagement_templates (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  title text not null check (length(btrim(title)) between 1 and 240),
  body text not null check (length(btrim(body)) between 1 and 30000),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists engagement_templates_firm_active_idx
  on public.engagement_templates(firm_id,is_active,name);

create table if not exists public.client_engagements (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  template_id uuid references public.engagement_templates(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 240),
  body text not null check (length(btrim(body)) between 1 and 30000),
  status text not null default 'sent' check (status in ('sent','acknowledged','withdrawn')),
  sent_by uuid not null references public.profiles(id) on delete restrict,
  sent_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles(id) on delete restrict,
  acknowledged_name text check (
    acknowledged_name is null
    or length(btrim(acknowledged_name)) between 1 and 240
  ),
  acknowledged_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  unique(client_id,template_id,sent_at)
);

create index if not exists client_engagements_firm_status_idx
  on public.client_engagements(firm_id,status,sent_at desc);
create index if not exists client_engagements_client_status_idx
  on public.client_engagements(client_id,status,sent_at desc);

alter table public.engagement_templates enable row level security;
alter table public.client_engagements enable row level security;

create policy "engagement_templates_staff_select"
on public.engagement_templates for select to authenticated
using (private.is_firm_staff() and firm_id=private.current_firm_id());

create policy "engagement_templates_staff_insert"
on public.engagement_templates for insert to authenticated
with check (
  private.has_staff_permission('templates.manage')
  and firm_id=private.current_firm_id()
  and created_by=(select auth.uid())
);

create policy "engagement_templates_staff_update"
on public.engagement_templates for update to authenticated
using (
  private.has_staff_permission('templates.manage')
  and firm_id=private.current_firm_id()
)
with check (
  private.has_staff_permission('templates.manage')
  and firm_id=private.current_firm_id()
);

create policy "engagements_staff_select"
on public.client_engagements for select to authenticated
using (private.is_firm_staff() and firm_id=private.current_firm_id());

create policy "engagements_client_select"
on public.client_engagements for select to authenticated
using (
  client_id=private.current_client_id()
  and status in ('sent','acknowledged')
);

create policy "engagements_staff_insert"
on public.client_engagements for insert to authenticated
with check (
  private.has_staff_permission('clients.manage')
  and firm_id=private.current_firm_id()
  and sent_by=(select auth.uid())
);

create policy "engagements_staff_update"
on public.client_engagements for update to authenticated
using (
  private.has_staff_permission('clients.manage')
  and firm_id=private.current_firm_id()
)
with check (
  private.has_staff_permission('clients.manage')
  and firm_id=private.current_firm_id()
);

revoke all on public.engagement_templates, public.client_engagements from anon, authenticated;
grant select,insert,update on public.engagement_templates to authenticated;
grant select,insert,update on public.client_engagements to authenticated;

create or replace function private.validate_engagement_template()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.name:=btrim(new.name);
  new.title:=btrim(new.title);
  new.body:=btrim(new.body);
  new.updated_at:=now();
  return new;
end;
$$;

create trigger engagement_templates_validate
before insert or update on public.engagement_templates
for each row execute function private.validate_engagement_template();

create or replace function private.validate_client_engagement()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from clients c where c.id=new.client_id and c.firm_id=new.firm_id) then
    raise exception 'Client must belong to the same firm';
  end if;
  if new.template_id is not null and not exists (
    select 1 from engagement_templates t where t.id=new.template_id and t.firm_id=new.firm_id
  ) then
    raise exception 'Template must belong to the same firm';
  end if;
  if not exists (
    select 1 from profiles p
    where p.id=new.sent_by and p.firm_id=new.firm_id
      and p.is_active and p.role in ('firm_admin','firm_staff')
  ) then
    raise exception 'Sender must be active staff in the same firm';
  end if;
  if new.status='acknowledged' and (
    new.acknowledged_by is null or new.acknowledged_name is null or new.acknowledged_at is null
  ) then
    raise exception 'Acknowledgment details are required';
  end if;
  return new;
end;
$$;

create trigger client_engagements_validate
before insert or update on public.client_engagements
for each row execute function private.validate_client_engagement();

create or replace function public.acknowledge_client_engagement(
  p_engagement_id uuid,
  p_name text
)
returns public.client_engagements
language plpgsql security definer set search_path=public as $$
declare
  v_client_id uuid;
  v_row client_engagements;
begin
  v_client_id:=private.current_client_id();
  if v_client_id is null then raise exception 'Client account required'; end if;
  if coalesce(length(btrim(p_name)),0)=0 or length(btrim(p_name))>240 then
    raise exception 'Enter your full name';
  end if;

  select * into v_row
  from client_engagements
  where id=p_engagement_id and client_id=v_client_id
  for update;

  if v_row.id is null then raise exception 'Engagement not found'; end if;
  if v_row.status='withdrawn' then raise exception 'This engagement is no longer available'; end if;
  if v_row.status='acknowledged' then return v_row; end if;

  update client_engagements
  set status='acknowledged',
      acknowledged_by=auth.uid(),
      acknowledged_name=btrim(p_name),
      acknowledged_at=now()
  where id=v_row.id
  returning * into v_row;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_row.firm_id,auth.uid(),'engagement.acknowledged','client_engagement',v_row.id,
    jsonb_build_object('client_id',v_row.client_id)
  );
  return v_row;
end;
$$;

create or replace function public.send_client_engagement(
  p_client_id uuid,
  p_template_id uuid
)
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_actor profiles;
  v_client clients;
  v_template engagement_templates;
  v_id uuid;
begin
  select * into v_actor from profiles where id=auth.uid() and is_active;
  if v_actor.id is null or not private.has_staff_permission('clients.manage') then
    raise exception 'Not authorized';
  end if;

  select * into v_client from clients where id=p_client_id and firm_id=v_actor.firm_id;
  if v_client.id is null then raise exception 'Client not found'; end if;

  select * into v_template from engagement_templates
  where id=p_template_id and firm_id=v_actor.firm_id and is_active;
  if v_template.id is null then raise exception 'Template not found'; end if;

  insert into client_engagements(firm_id,client_id,template_id,title,body,sent_by)
  values(v_actor.firm_id,v_client.id,v_template.id,v_template.title,v_template.body,v_actor.id)
  returning id into v_id;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_actor.firm_id,v_actor.id,'engagement.sent','client_engagement',v_id,
    jsonb_build_object('client_id',v_client.id,'template_id',v_template.id)
  );

  return v_id;
end;
$$;

revoke all on function private.validate_engagement_template(),
  private.validate_client_engagement(),
  public.acknowledge_client_engagement(uuid,text),
  public.send_client_engagement(uuid,uuid)
from public, anon;

grant execute on function public.acknowledge_client_engagement(uuid,text),
  public.send_client_engagement(uuid,uuid)
to authenticated;
