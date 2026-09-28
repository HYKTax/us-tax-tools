create table if not exists public.document_requests (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 240),
  details text check (details is null or length(details) <= 5000),
  due_date date,
  status text not null default 'open'
    check (status in ('open','received','reviewed','cancelled')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  received_at timestamptz,
  reviewed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_requests_firm_status_due_idx
  on public.document_requests(firm_id,status,due_date);
create index if not exists document_requests_client_status_idx
  on public.document_requests(client_id,status,created_at desc);
create index if not exists document_requests_requested_by_idx
  on public.document_requests(requested_by);

alter table public.document_requests enable row level security;

drop policy if exists "document_requests_select_authorized" on public.document_requests;
create policy "document_requests_select_authorized"
on public.document_requests for select to authenticated
using (
  (private.is_firm_staff() and firm_id = private.current_firm_id())
  or client_id = private.current_client_id()
);

drop policy if exists "document_requests_insert_staff" on public.document_requests;
create policy "document_requests_insert_staff"
on public.document_requests for insert to authenticated
with check (
  private.has_staff_permission('documents.manage')
  and firm_id = private.current_firm_id()
  and requested_by = (select auth.uid())
);

drop policy if exists "document_requests_update_staff" on public.document_requests;
create policy "document_requests_update_staff"
on public.document_requests for update to authenticated
using (
  private.has_staff_permission('documents.manage')
  and firm_id = private.current_firm_id()
)
with check (
  private.has_staff_permission('documents.manage')
  and firm_id = private.current_firm_id()
);

grant select, insert, update on public.document_requests to authenticated;

alter table public.documents
  add column if not exists document_request_id uuid
  references public.document_requests(id) on delete set null;

create index if not exists documents_request_idx
  on public.documents(document_request_id,created_at desc)
  where document_request_id is not null;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'message','client_message','document_request','document_received',
    'organizer_sent','organizer_started','organizer_submitted','organizer_reviewed',
    'changes_requested','organizer_updated','tax_return_review_requested',
    'tax_return_review_changes_requested','tax_return_review_approved',
    'tax_return_copy_released','tax_return_copy_withdrawn'
  )
);

create or replace function private.validate_document_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from clients c
    where c.id = new.client_id and c.firm_id = new.firm_id
  ) then raise exception 'Client must belong to the same firm'; end if;

  if not exists (
    select 1 from profiles p
    where p.id = new.requested_by
      and p.firm_id = new.firm_id
      and p.is_active
      and p.role in ('firm_admin','firm_staff')
  ) then raise exception 'Requester must be active staff in the same firm'; end if;

  if tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      new.cancelled_at := now();
    elsif new.status <> 'cancelled' then
      new.cancelled_at := null;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists document_requests_validate on public.document_requests;
create trigger document_requests_validate
before insert or update on public.document_requests
for each row execute function private.validate_document_request();

create or replace function private.validate_document_request_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request document_requests;
  v_role profile_role;
begin
  if new.document_request_id is null then return new; end if;

  select * into v_request from document_requests where id = new.document_request_id;

  if v_request.id is null
     or v_request.firm_id is distinct from new.firm_id
     or v_request.client_id is distinct from new.client_id then
    raise exception 'Document request must belong to this client and firm';
  end if;

  select role into v_role from profiles where id = new.uploaded_by;
  if v_role = 'client' and v_request.status not in ('open','received') then
    raise exception 'This document request is no longer accepting uploads';
  end if;

  return new;
end;
$$;

drop trigger if exists documents_validate_request_scope on public.documents;
create trigger documents_validate_request_scope
before insert or update of document_request_id on public.documents
for each row execute function private.validate_document_request_link();

create or replace function private.sync_document_request_from_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request document_requests;
  v_uploader_role profile_role;
  v_all_reviewed boolean;
begin
  if new.document_request_id is null then return new; end if;

  select * into v_request
  from document_requests
  where id = new.document_request_id
  for update;

  if v_request.id is null or v_request.status = 'cancelled' then return new; end if;

  if tg_op = 'INSERT' then
    update document_requests
    set status = case when status = 'open' then 'received' else status end,
        received_at = coalesce(received_at, now()),
        updated_at = now()
    where id = new.document_request_id;

    select role into v_uploader_role from profiles where id = new.uploaded_by;

    if v_uploader_role = 'client' then
      insert into notifications(
        subject_client_id,recipient_id,recipient_email,kind,event_key,created_at
      )
      select
        v_request.client_id,p.id,p.email,'document_received',
        'document-received:' || new.id::text,now()
      from profiles p
      where p.id = v_request.requested_by
        and p.is_active
        and p.firm_id = v_request.firm_id
        and p.role in ('firm_admin','firm_staff')
      on conflict(event_key) do nothing;
    end if;
  end if;

  if new.status = 'reviewed' then
    select not exists (
      select 1 from documents d
      where d.document_request_id = new.document_request_id
        and d.status <> 'reviewed'
    ) into v_all_reviewed;

    if v_all_reviewed then
      update document_requests
      set status = 'reviewed',
          reviewed_at = coalesce(reviewed_at, now()),
          updated_at = now()
      where id = new.document_request_id
        and status <> 'cancelled';
    end if;
  elsif tg_op = 'UPDATE'
        and old.status = 'reviewed'
        and new.status <> 'reviewed' then
    update document_requests
    set status = 'received',
        reviewed_at = null,
        updated_at = now()
    where id = new.document_request_id
      and status = 'reviewed';
  end if;

  return new;
end;
$$;

drop trigger if exists documents_sync_request on public.documents;
create trigger documents_sync_request
after insert or update of status,document_request_id on public.documents
for each row execute function private.sync_document_request_from_document();

create or replace function public.create_document_request(
  p_client_id uuid,
  p_title text,
  p_details text default null,
  p_due_date date default null
)
returns public.document_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_client clients;
  v_request document_requests;
begin
  select * into v_actor from profiles where id = auth.uid() and is_active;
  if v_actor.id is null or not private.has_staff_permission('documents.manage') then
    raise exception 'Not authorized';
  end if;

  if coalesce(length(btrim(p_title)),0) = 0 or length(btrim(p_title)) > 240 then
    raise exception 'Request title must be between 1 and 240 characters';
  end if;
  if p_details is not null and length(p_details) > 5000 then
    raise exception 'Request details must be 5000 characters or fewer';
  end if;

  select * into v_client
  from clients
  where id = p_client_id
    and firm_id = v_actor.firm_id
    and status <> 'archived';

  if v_client.id is null then raise exception 'Client not found'; end if;

  insert into document_requests(
    firm_id,client_id,title,details,due_date,requested_by
  )
  values(
    v_actor.firm_id,v_client.id,btrim(p_title),
    nullif(btrim(coalesce(p_details,'')),''),
    p_due_date,v_actor.id
  )
  returning * into v_request;

  insert into notifications(
    subject_client_id,target_client_id,recipient_email,kind,event_key,created_at
  )
  values(
    v_client.id,v_client.id,v_client.email,'document_request',
    'document-request:' || v_request.id::text,v_request.created_at
  )
  on conflict(event_key) do nothing;

  insert into audit_log(
    firm_id,actor_id,action,target_type,target_id,metadata
  )
  values(
    v_actor.firm_id,v_actor.id,'document_request.created','client',v_client.id,
    jsonb_build_object('document_request_id',v_request.id,'due_date',v_request.due_date)
  );

  return v_request;
end;
$$;

create or replace function public.cancel_document_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_request document_requests;
begin
  select * into v_actor from profiles where id = auth.uid() and is_active;
  if v_actor.id is null or not private.has_staff_permission('documents.manage') then
    raise exception 'Not authorized';
  end if;

  select * into v_request
  from document_requests
  where id = p_request_id
    and firm_id = v_actor.firm_id
  for update;

  if v_request.id is null then raise exception 'Document request not found'; end if;
  if v_request.status = 'reviewed' then
    raise exception 'A reviewed request cannot be cancelled';
  end if;

  update document_requests
  set status='cancelled',cancelled_at=now(),updated_at=now()
  where id=v_request.id;
end;
$$;

revoke all on function public.create_document_request(uuid,text,text,date),
  public.cancel_document_request(uuid),
  private.validate_document_request(),
  private.validate_document_request_link(),
  private.sync_document_request_from_document()
from public, anon;

grant execute on function public.create_document_request(uuid,text,text,date),
  public.cancel_document_request(uuid)
to authenticated;
