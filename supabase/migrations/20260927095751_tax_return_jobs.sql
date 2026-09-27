-- Dedicated tax return work records for firm workflow.
-- Staff-only: clients do not receive direct access to internal preparation/e-file statuses.

create table public.tax_return_jobs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  organizer_id uuid references public.organizers(id) on delete set null,
  tax_year int not null check (tax_year between 2000 and 2100),
  return_type text not null check (
    return_type in ('1040','1040-NR','1065','1120-S','1120','1041','990','706','709','other')
  ),
  status text not null default 'not_started' check (
    status in (
      'not_started','waiting_on_client','ready_to_prepare','preparing','review',
      'waiting_on_signature','ready_to_file','e_filed','accepted','rejected',
      'extended','completed'
    )
  ),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  preparer_id uuid references public.profiles(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  due_date date,
  extension_status text not null default 'not_needed' check (
    extension_status in ('not_needed','planned','filed')
  ),
  extension_filed_at timestamptz,
  efile_status text not null default 'not_ready' check (
    efile_status in ('not_ready','ready','transmitted','accepted','rejected')
  ),
  efile_transmitted_at timestamptz,
  efile_accepted_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tax_return_jobs_firm_id_idx on public.tax_return_jobs(firm_id);
create index tax_return_jobs_client_id_idx on public.tax_return_jobs(client_id);
create index tax_return_jobs_status_idx on public.tax_return_jobs(firm_id,status,due_date);
create index tax_return_jobs_preparer_idx on public.tax_return_jobs(preparer_id,status);
create index tax_return_jobs_reviewer_idx on public.tax_return_jobs(reviewer_id,status);

create trigger tax_return_jobs_set_updated_at
before update on public.tax_return_jobs
for each row execute function private.set_updated_at();

create or replace function private.validate_tax_return_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from clients c where c.id = new.client_id and c.firm_id = new.firm_id
  ) then raise exception 'Client must belong to the same firm'; end if;

  if new.organizer_id is not null and not exists (
    select 1 from organizers o
    where o.id = new.organizer_id and o.firm_id = new.firm_id and o.client_id = new.client_id
  ) then raise exception 'Organizer must belong to this client and firm'; end if;

  if new.created_by is null or not exists (
    select 1 from profiles p
    where p.id = new.created_by and p.firm_id = new.firm_id
      and p.role in ('firm_admin','firm_staff')
  ) then raise exception 'Creator must be staff in the same firm'; end if;

  if new.preparer_id is not null and not exists (
    select 1 from profiles p
    where p.id = new.preparer_id and p.firm_id = new.firm_id
      and p.role in ('firm_admin','firm_staff')
  ) then raise exception 'Preparer must be staff in the same firm'; end if;

  if new.reviewer_id is not null and not exists (
    select 1 from profiles p
    where p.id = new.reviewer_id and p.firm_id = new.firm_id
      and p.role in ('firm_admin','firm_staff')
  ) then raise exception 'Reviewer must be staff in the same firm'; end if;

  if new.extension_status = 'filed' and new.extension_filed_at is null then
    new.extension_filed_at := now();
  elsif new.extension_status <> 'filed' then
    new.extension_filed_at := null;
  end if;

  if new.efile_status in ('transmitted','accepted','rejected') and new.efile_transmitted_at is null then
    new.efile_transmitted_at := now();
  end if;

  if new.efile_status = 'accepted' and new.efile_accepted_at is null then
    new.efile_accepted_at := now();
  elsif new.efile_status <> 'accepted' then
    new.efile_accepted_at := null;
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

create trigger tax_return_jobs_validate
before insert or update on public.tax_return_jobs
for each row execute function private.validate_tax_return_job();

create or replace function private.audit_tax_return_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
    values (
      new.firm_id, auth.uid(), 'tax_return.created', 'tax_return_job', new.id,
      jsonb_build_object('return_type',new.return_type,'tax_year',new.tax_year,'status',new.status)
    );
  elsif new.status is distinct from old.status
     or new.preparer_id is distinct from old.preparer_id
     or new.reviewer_id is distinct from old.reviewer_id
     or new.efile_status is distinct from old.efile_status
     or new.extension_status is distinct from old.extension_status then
    insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
    values (
      new.firm_id, auth.uid(), 'tax_return.updated', 'tax_return_job', new.id,
      jsonb_build_object(
        'old_status',old.status,'new_status',new.status,
        'efile_status',new.efile_status,'extension_status',new.extension_status
      )
    );
  end if;
  return new;
end;
$$;

create trigger tax_return_jobs_audit
after insert or update on public.tax_return_jobs
for each row execute function private.audit_tax_return_job();

alter table public.tax_return_jobs enable row level security;

create policy "tax_return_jobs_staff_select"
on public.tax_return_jobs for select to authenticated
using (private.is_firm_staff() and firm_id = private.current_firm_id());

create policy "tax_return_jobs_staff_insert"
on public.tax_return_jobs for insert to authenticated
with check (
  private.is_firm_staff()
  and firm_id = private.current_firm_id()
  and created_by = auth.uid()
);

create policy "tax_return_jobs_staff_update"
on public.tax_return_jobs for update to authenticated
using (private.is_firm_staff() and firm_id = private.current_firm_id())
with check (private.is_firm_staff() and firm_id = private.current_firm_id());

revoke all on public.tax_return_jobs from anon, authenticated;
grant select, insert, update on public.tax_return_jobs to authenticated;

revoke all on function private.validate_tax_return_job(), private.audit_tax_return_job()
from public, anon, authenticated;
