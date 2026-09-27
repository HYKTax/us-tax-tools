create table public.tax_return_source_values (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  tax_return_job_id uuid not null references public.tax_return_jobs(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  extraction_id uuid not null references public.document_extractions(id) on delete cascade,
  field_name text not null,
  field_label text not null,
  value text not null,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  accepted_by uuid not null references public.profiles(id),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tax_return_job_id, document_id, field_name)
);

create index tax_return_source_values_job_idx
  on public.tax_return_source_values(tax_return_job_id, field_name);
create index tax_return_source_values_document_idx
  on public.tax_return_source_values(document_id);
create index tax_return_source_values_extraction_idx
  on public.tax_return_source_values(extraction_id);
create index tax_return_source_values_accepted_by_idx
  on public.tax_return_source_values(accepted_by);

alter table public.tax_return_source_values enable row level security;

create policy "tax_return_source_values_staff_select"
on public.tax_return_source_values
for select
to authenticated
using (
  private.is_firm_staff()
  and firm_id = private.current_firm_id()
);

revoke all on public.tax_return_source_values from anon, authenticated;
grant select on public.tax_return_source_values to authenticated;

create or replace function public.accept_document_extraction(p_document_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc documents;
  v_extraction document_extractions;
  v_field jsonb;
  v_count integer := 0;
begin
  if auth.uid() is null or not private.is_firm_staff() then
    raise exception 'Not authorized';
  end if;

  select * into v_doc
  from documents
  where id = p_document_id
    and firm_id = private.current_firm_id()
  for update;

  if v_doc.id is null then
    raise exception 'Document not found';
  end if;

  if v_doc.tax_return_job_id is null then
    raise exception 'Link this document to a tax return first';
  end if;

  if v_doc.status <> 'reviewed' then
    raise exception 'Review the source document before accepting AI data';
  end if;

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

  for v_field in
    select value from jsonb_array_elements(v_extraction.fields)
  loop
    if coalesce(btrim(v_field->>'name'), '') <> ''
       and coalesce(btrim(v_field->>'label'), '') <> ''
       and coalesce(btrim(v_field->>'value'), '') <> '' then
      insert into tax_return_source_values (
        firm_id,
        tax_return_job_id,
        document_id,
        extraction_id,
        field_name,
        field_label,
        value,
        confidence,
        accepted_by,
        accepted_at
      )
      values (
        v_doc.firm_id,
        v_doc.tax_return_job_id,
        v_doc.id,
        v_extraction.id,
        btrim(v_field->>'name'),
        btrim(v_field->>'label'),
        btrim(v_field->>'value'),
        case
          when (v_field->>'confidence') ~ '^[0-9]+([.][0-9]+)?$'
          then least(1, greatest(0, (v_field->>'confidence')::numeric))
          else null
        end,
        auth.uid(),
        now()
      );
      v_count := v_count + 1;
    end if;
  end loop;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values (
    v_doc.firm_id,
    auth.uid(),
    'document.ai_data_accepted',
    'document',
    v_doc.id,
    jsonb_build_object(
      'tax_return_job_id', v_doc.tax_return_job_id,
      'extraction_id', v_extraction.id,
      'field_count', v_count
    )
  );

  return v_count;
end;
$$;

revoke all on function public.accept_document_extraction(uuid) from public, anon;
grant execute on function public.accept_document_extraction(uuid) to authenticated;
