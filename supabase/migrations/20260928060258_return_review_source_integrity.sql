create or replace function private.guard_document_return_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_job uuid;
  v_new_job uuid;
begin
  v_new_job := new.tax_return_job_id;
  if tg_op = 'UPDATE' then
    v_old_job := old.tax_return_job_id;
    if v_new_job is not distinct from v_old_job then
      return new;
    end if;
  end if;

  if v_old_job is not null and exists (
    select 1 from tax_return_reviews
    where tax_return_job_id = v_old_job
      and status = 'requested'
  ) then
    raise exception 'Resolve the active return review before unlinking this document';
  end if;

  if v_new_job is not null and exists (
    select 1 from tax_return_reviews
    where tax_return_job_id = v_new_job
      and status = 'requested'
  ) then
    raise exception 'Resolve the active return review before linking another document';
  end if;

  return new;
end;
$$;

drop trigger if exists documents_guard_return_review on public.documents;
create trigger documents_guard_return_review
before insert or update of tax_return_job_id on public.documents
for each row execute function private.guard_document_return_review();

create or replace function private.invalidate_review_for_document_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_job tax_return_jobs;
begin
  if tg_op = 'UPDATE'
     and new.tax_return_job_id is not distinct from old.tax_return_job_id then
    return new;
  end if;

  for v_job_id in
    select distinct job_id
    from (
      values
        (case when tg_op = 'UPDATE' then old.tax_return_job_id else null end),
        (new.tax_return_job_id)
    ) as affected(job_id)
    where job_id is not null
  loop
    select * into v_job
    from tax_return_jobs
    where id = v_job_id
    for update;

    if v_job.id is not null
       and private.has_current_return_approval(v_job.id, v_job.review_version) then
      update tax_return_jobs
      set review_version = review_version + 1,
          status = 'preparing',
          efile_status = 'not_ready'
      where id = v_job.id;

      insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
      values (
        v_job.firm_id,
        auth.uid(),
        'tax_return.review_invalidated',
        'tax_return_job',
        v_job.id,
        jsonb_build_object(
          'reason','document_link_changed',
          'document_id',new.id,
          'old_review_version',v_job.review_version,
          'new_review_version',v_job.review_version + 1
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists documents_invalidate_return_review on public.documents;
create trigger documents_invalidate_return_review
after insert or update of tax_return_job_id on public.documents
for each row execute function private.invalidate_review_for_document_link();

create or replace function public.accept_document_extraction(p_document_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc documents;
  v_extraction document_extractions;
  v_job tax_return_jobs;
  v_field jsonb;
  v_count integer := 0;
  v_had_approval boolean := false;
begin
  if auth.uid() is null or not private.has_staff_permission('returns.review') then
    raise exception 'Not authorized';
  end if;

  select * into v_doc
  from documents
  where id = p_document_id
    and firm_id = private.current_firm_id()
  for update;

  if v_doc.id is null then raise exception 'Document not found'; end if;
  if v_doc.tax_return_job_id is null then raise exception 'Link this document to a tax return first'; end if;
  if v_doc.status <> 'reviewed' then raise exception 'Review the source document before accepting AI data'; end if;

  if exists (
    select 1 from tax_return_reviews
    where tax_return_job_id = v_doc.tax_return_job_id
      and status = 'requested'
  ) then
    raise exception 'Resolve the active return review before changing approved source data';
  end if;

  select * into v_job
  from tax_return_jobs
  where id = v_doc.tax_return_job_id
    and firm_id = v_doc.firm_id
  for update;

  if v_job.id is null then raise exception 'Tax return not found'; end if;

  v_had_approval := private.has_current_return_approval(v_job.id, v_job.review_version);

  select * into v_extraction
  from document_extractions
  where document_id = v_doc.id
  for update;

  if v_extraction.id is null
     or v_extraction.status <> 'completed'
     or v_extraction.reviewed_at is null
     or v_extraction.reviewed_by is null then
    raise exception 'Review the completed AI extraction before accepting it';
  end if;

  if jsonb_typeof(v_extraction.fields) <> 'array' then
    raise exception 'Extraction has no structured fields';
  end if;

  delete from tax_return_source_values
  where tax_return_job_id = v_doc.tax_return_job_id
    and document_id = v_doc.id;

  for v_field in select value from jsonb_array_elements(v_extraction.fields)
  loop
    if coalesce(btrim(v_field->>'name'), '') <> ''
       and coalesce(btrim(v_field->>'label'), '') <> ''
       and coalesce(btrim(v_field->>'value'), '') <> '' then
      insert into tax_return_source_values (
        firm_id,tax_return_job_id,document_id,extraction_id,field_name,field_label,
        value,confidence,accepted_by,accepted_at
      )
      values (
        v_doc.firm_id,v_doc.tax_return_job_id,v_doc.id,v_extraction.id,
        btrim(v_field->>'name'),btrim(v_field->>'label'),btrim(v_field->>'value'),
        case
          when (v_field->>'confidence') ~ '^[0-9]+([.][0-9]+)?$'
          then least(1, greatest(0, (v_field->>'confidence')::numeric))
          else null
        end,
        auth.uid(),now()
      );
      v_count := v_count + 1;
    end if;
  end loop;

  if v_had_approval then
    update tax_return_jobs
    set review_version = review_version + 1,
        status = 'preparing',
        efile_status = 'not_ready'
    where id = v_job.id;

    insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
    values (
      v_job.firm_id,
      auth.uid(),
      'tax_return.review_invalidated',
      'tax_return_job',
      v_job.id,
      jsonb_build_object(
        'reason','approved_source_data_changed',
        'document_id',v_doc.id,
        'old_review_version',v_job.review_version,
        'new_review_version',v_job.review_version + 1
      )
    );
  end if;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values (
    v_doc.firm_id,auth.uid(),'document.ai_data_accepted','document',v_doc.id,
    jsonb_build_object(
      'tax_return_job_id', v_doc.tax_return_job_id,
      'extraction_id', v_extraction.id,
      'field_count', v_count
    )
  );

  return v_count;
end;
$$;

revoke all on function private.guard_document_return_review(),
  private.invalidate_review_for_document_link()
from public, anon, authenticated;
