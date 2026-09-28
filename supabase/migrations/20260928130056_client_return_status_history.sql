create table if not exists public.tax_return_status_history (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  tax_return_job_id uuid not null references public.tax_return_jobs(id) on delete cascade,
  status text not null,
  client_stage text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tax_return_status_history_job_created_idx
  on public.tax_return_status_history(tax_return_job_id, created_at desc);
create index if not exists tax_return_status_history_client_created_idx
  on public.tax_return_status_history(client_id, created_at desc);

alter table public.tax_return_status_history enable row level security;

drop policy if exists "tax_return_status_history_staff_select"
on public.tax_return_status_history;
create policy "tax_return_status_history_staff_select"
on public.tax_return_status_history for select to authenticated
using (
  private.is_firm_staff()
  and firm_id = private.current_firm_id()
);

grant select on public.tax_return_status_history to authenticated;

create or replace function private.client_stage_for_return_status(p_status text)
returns text language sql immutable as $$
  select case p_status
    when 'waiting_on_client' then 'action_needed'
    when 'ready_to_prepare' then 'preparing'
    when 'preparing' then 'preparing'
    when 'review' then 'review'
    when 'waiting_on_signature' then 'signature_needed'
    when 'ready_to_file' then 'ready_to_file'
    when 'e_filed' then 'filed'
    when 'accepted' then 'accepted'
    when 'rejected' then 'filing_issue'
    when 'extended' then 'extended'
    when 'completed' then 'completed'
    else 'preparing'
  end
$$;

create or replace function private.capture_tax_return_status_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_stage text;
  v_old_stage text;
begin
  v_stage := private.client_stage_for_return_status(new.status);

  if tg_op = 'INSERT' then
    if new.status <> 'not_started' then
      insert into tax_return_status_history(
        firm_id,client_id,tax_return_job_id,status,client_stage,changed_by,created_at
      )
      values(
        new.firm_id,new.client_id,new.id,new.status,v_stage,auth.uid(),new.created_at
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    v_old_stage := private.client_stage_for_return_status(old.status);
    if v_stage is distinct from v_old_stage then
      insert into tax_return_status_history(
        firm_id,client_id,tax_return_job_id,status,client_stage,changed_by,created_at
      )
      values(
        new.firm_id,new.client_id,new.id,new.status,v_stage,auth.uid(),now()
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tax_return_jobs_status_history on public.tax_return_jobs;
create trigger tax_return_jobs_status_history
after insert or update of status on public.tax_return_jobs
for each row execute function private.capture_tax_return_status_history();

insert into public.tax_return_status_history(
  firm_id,client_id,tax_return_job_id,status,client_stage,changed_by,created_at
)
select
  j.firm_id,j.client_id,j.id,j.status,
  private.client_stage_for_return_status(j.status),
  j.created_by,coalesce(j.updated_at,j.created_at)
from public.tax_return_jobs j
where j.status <> 'not_started'
  and not exists (
    select 1 from public.tax_return_status_history h
    where h.tax_return_job_id = j.id
  );

create or replace function public.get_client_return_status_history()
returns table (
  tax_return_job_id uuid,
  tax_year integer,
  return_type text,
  client_stage text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  v_client_id := private.current_client_id();

  if v_client_id is null then
    raise exception 'Client account required';
  end if;

  return query
  select
    h.tax_return_job_id,
    j.tax_year,
    j.return_type,
    h.client_stage,
    h.created_at
  from tax_return_status_history h
  join tax_return_jobs j
    on j.id = h.tax_return_job_id
   and j.client_id = h.client_id
   and j.firm_id = h.firm_id
  where h.client_id = v_client_id
  order by h.created_at desc, h.id desc;
end;
$$;

revoke all on function private.client_stage_for_return_status(text),
  private.capture_tax_return_status_history()
from public, anon, authenticated;

revoke all on function public.get_client_return_status_history()
from public, anon;

grant execute on function public.get_client_return_status_history()
to authenticated;
