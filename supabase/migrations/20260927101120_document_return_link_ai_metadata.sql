alter table public.documents
  add column if not exists tax_return_job_id uuid
  references public.tax_return_jobs(id) on delete set null;

create index if not exists documents_tax_return_job_id_idx
  on public.documents(tax_return_job_id);

alter table public.document_extractions
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists confidence numeric
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

create or replace function private.validate_document_return_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tax_return_job_id is not null and not exists (
    select 1
    from tax_return_jobs j
    where j.id = new.tax_return_job_id
      and j.firm_id = new.firm_id
      and j.client_id = new.client_id
  ) then
    raise exception 'Tax return must belong to the same client and firm';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_validate_return_scope on public.documents;
create trigger documents_validate_return_scope
before insert or update on public.documents
for each row execute function private.validate_document_return_scope();

revoke all on function private.validate_document_return_scope()
from public, anon, authenticated;
