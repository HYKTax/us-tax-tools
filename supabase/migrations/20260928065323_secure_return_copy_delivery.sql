alter table public.documents
  add column if not exists document_kind text not null default 'source',
  add column if not exists client_visible boolean not null default false,
  add column if not exists released_at timestamptz,
  add column if not exists released_by uuid references public.profiles(id);

alter table public.documents
  drop constraint if exists documents_document_kind_check;

alter table public.documents
  add constraint documents_document_kind_check
  check (document_kind in ('source','return_copy','other'));

alter table public.documents disable trigger user;

update public.documents d
set client_visible = true
where exists (
  select 1
  from public.profiles p
  where p.id = d.uploaded_by
    and p.role = 'client'
);

alter table public.documents enable trigger user;

create index if not exists documents_client_visible_idx
  on public.documents(client_id, released_at desc)
  where client_visible;

create index if not exists documents_return_copy_idx
  on public.documents(tax_return_job_id, created_at desc)
  where document_kind = 'return_copy';

create or replace function private.set_document_delivery_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role profile_role;
begin
  select role into v_role
  from profiles
  where id = new.uploaded_by;

  if v_role = 'client' then
    new.document_kind := 'source';
    new.client_visible := true;
    new.released_at := null;
    new.released_by := null;
  else
    new.client_visible := false;
    new.released_at := null;
    new.released_by := null;
  end if;

  if new.document_kind = 'return_copy' and new.tax_return_job_id is null then
    raise exception 'A return copy must be linked to a tax return';
  end if;

  return new;
end;
$$;

drop trigger if exists documents_set_delivery_defaults on public.documents;
create trigger documents_set_delivery_defaults
before insert on public.documents
for each row execute function private.set_document_delivery_defaults();

create or replace function private.guard_document_delivery_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.document_kind is distinct from old.document_kind
    or new.client_visible is distinct from old.client_visible
    or new.released_at is distinct from old.released_at
    or new.released_by is distinct from old.released_by
  ) and coalesce(current_setting('app.allow_document_delivery_change', true), '') <> '1' then
    raise exception 'Document delivery fields can only be changed through the controlled release workflow';
  end if;

  return new;
end;
$$;

drop trigger if exists documents_guard_delivery_fields on public.documents;
create trigger documents_guard_delivery_fields
before update on public.documents
for each row execute function private.guard_document_delivery_fields();

drop policy if exists "documents_select_authorized" on public.documents;
create policy "documents_select_authorized"
on public.documents
for select
to authenticated
using (
  (
    private.is_firm_staff()
    and firm_id = private.current_firm_id()
  )
  or (
    client_id = private.current_client_id()
    and client_visible
  )
);

drop policy if exists "storage_select_authorized" on storage.objects;
create policy "storage_select_authorized"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'client-documents'
  and (
    (
      private.is_firm_staff()
      and (storage.foldername(name))[1] = private.current_firm_id()::text
    )
    or exists (
      select 1
      from public.documents d
      where d.storage_path = storage.objects.name
        and d.client_id = private.current_client_id()
        and d.client_visible
    )
  )
);

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check check (
    kind in (
      'message',
      'organizer_sent',
      'organizer_started',
      'organizer_submitted',
      'organizer_reviewed',
      'changes_requested',
      'organizer_updated',
      'tax_return_review_requested',
      'tax_return_review_changes_requested',
      'tax_return_review_approved',
      'tax_return_copy_released',
      'tax_return_copy_withdrawn'
    )
  );

create or replace function public.set_return_copy_visibility(
  p_document_id uuid,
  p_visible boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_doc documents;
  v_job tax_return_jobs;
  v_client clients;
  v_timestamp timestamptz := now();
begin
  select * into v_actor
  from profiles
  where id = auth.uid();

  if v_actor.id is null
     or not v_actor.is_active
     or not private.has_staff_permission('returns.review') then
    raise exception 'Not authorized';
  end if;

  select * into v_doc
  from documents
  where id = p_document_id
    and firm_id = v_actor.firm_id
    and document_kind = 'return_copy'
  for update;

  if v_doc.id is null then
    raise exception 'Return copy not found';
  end if;

  if v_doc.tax_return_job_id is null then
    raise exception 'Return copy is not linked to a tax return';
  end if;

  select * into v_job
  from tax_return_jobs
  where id = v_doc.tax_return_job_id
    and firm_id = v_doc.firm_id
    and client_id = v_doc.client_id
  for share;

  if v_job.id is null then
    raise exception 'Linked tax return not found';
  end if;

  if p_visible then
    if not private.has_current_return_approval(v_job.id, v_job.review_version) then
      raise exception 'Current reviewer approval is required before releasing a return copy';
    end if;

    if v_job.status not in ('accepted','completed') then
      raise exception 'The return must be accepted or completed before releasing the final copy';
    end if;

    perform set_config('app.allow_document_delivery_change', '1', true);

    update documents
    set client_visible = true,
        released_at = v_timestamp,
        released_by = auth.uid()
    where id = v_doc.id;

    select * into v_client
    from clients
    where id = v_doc.client_id
      and firm_id = v_doc.firm_id;

    if v_client.id is not null and v_client.email is not null then
      insert into notifications(
        tax_return_job_id,
        target_client_id,
        recipient_email,
        kind,
        event_key,
        created_at
      )
      values(
        v_job.id,
        v_client.id,
        v_client.email,
        'tax_return_copy_released',
        'return-copy-released:' || v_doc.id::text || ':' || extract(epoch from v_timestamp)::bigint::text,
        v_timestamp
      )
      on conflict(event_key) do nothing;
    end if;

    insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
    values(
      v_doc.firm_id,
      auth.uid(),
      'document.return_copy_released',
      'document',
      v_doc.id,
      jsonb_build_object(
        'tax_return_job_id', v_job.id,
        'review_version', v_job.review_version
      )
    );
  else
    perform set_config('app.allow_document_delivery_change', '1', true);

    update documents
    set client_visible = false,
        released_at = null,
        released_by = null
    where id = v_doc.id;

    select * into v_client
    from clients
    where id = v_doc.client_id
      and firm_id = v_doc.firm_id;

    if v_client.id is not null and v_client.email is not null then
      insert into notifications(
        tax_return_job_id,
        target_client_id,
        recipient_email,
        kind,
        event_key,
        created_at
      )
      values(
        v_job.id,
        v_client.id,
        v_client.email,
        'tax_return_copy_withdrawn',
        'return-copy-withdrawn:' || v_doc.id::text || ':' || extract(epoch from v_timestamp)::bigint::text,
        v_timestamp
      )
      on conflict(event_key) do nothing;
    end if;

    insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
    values(
      v_doc.firm_id,
      auth.uid(),
      'document.return_copy_withdrawn',
      'document',
      v_doc.id,
      jsonb_build_object('tax_return_job_id', v_job.id)
    );
  end if;
end;
$$;

revoke all on function private.set_document_delivery_defaults(),
  private.guard_document_delivery_fields()
from public, anon, authenticated;

revoke all on function public.set_return_copy_visibility(uuid,boolean)
from public, anon;

grant execute on function public.set_return_copy_visibility(uuid,boolean)
to authenticated;
