create table if not exists public.document_access_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  access_type text not null check (access_type in ('client_open')),
  created_at timestamptz not null default now()
);

create index if not exists document_access_events_document_created_idx
  on public.document_access_events(document_id,created_at desc);

create index if not exists document_access_events_firm_created_idx
  on public.document_access_events(firm_id,created_at desc);

alter table public.document_access_events enable row level security;

create policy "document_access_events_staff_select"
on public.document_access_events
for select
to authenticated
using (
  private.is_firm_staff()
  and firm_id=private.current_firm_id()
);

revoke all on public.document_access_events from anon,authenticated;
grant select on public.document_access_events to authenticated;

create or replace function public.record_return_copy_access(
  p_document_id uuid
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_profile profiles;
  v_client_id uuid;
  v_document documents;
begin
  select * into v_profile
  from profiles
  where id=auth.uid()
    and is_active
    and role='client';

  if v_profile.id is null then
    raise exception 'Client account required';
  end if;

  v_client_id:=private.current_client_id();
  if v_client_id is null then
    raise exception 'Client account required';
  end if;

  select * into v_document
  from documents
  where id=p_document_id
    and client_id=v_client_id
    and document_kind='return_copy'
    and client_visible=true;

  if v_document.id is null then
    raise exception 'Return document not found';
  end if;

  insert into document_access_events(
    firm_id,client_id,document_id,actor_id,access_type
  )
  values(
    v_document.firm_id,v_document.client_id,v_document.id,v_profile.id,'client_open'
  );

  insert into audit_log(
    firm_id,actor_id,action,target_type,target_id,metadata
  )
  values(
    v_document.firm_id,v_profile.id,'document.return_copy_opened',
    'document',v_document.id,
    jsonb_build_object('client_id',v_document.client_id,'tax_return_job_id',v_document.tax_return_job_id)
  );

  return v_document.storage_path;
end;
$$;

revoke all on function public.record_return_copy_access(uuid) from public,anon;
grant execute on function public.record_return_copy_access(uuid) to authenticated;
