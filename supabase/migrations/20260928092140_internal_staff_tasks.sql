create or replace function private.has_staff_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.is_active
      and (
        p.role = 'firm_admin'
        or (
          p.role = 'firm_staff'
          and (
            (p.staff_role = 'manager' and p_permission in (
              'clients.manage','organizers.manage','organizers.review',
              'documents.manage','ai.run','documents.review',
              'returns.manage','returns.review','templates.manage',
              'tasks.manage','audit.view'
            ))
            or (p.staff_role = 'reviewer' and p_permission in (
              'organizers.review','ai.run','documents.review',
              'returns.manage','returns.review','tasks.manage'
            ))
            or (p.staff_role = 'preparer' and p_permission in (
              'clients.manage','organizers.manage','documents.manage',
              'ai.run','returns.manage','tasks.manage'
            ))
          )
        )
      )
  );
$$;

create table if not exists public.staff_tasks (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  tax_return_job_id uuid references public.tax_return_jobs(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 240),
  details text check (details is null or length(details) <= 5000),
  status text not null default 'open' check (status in ('open','in_progress','done')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_date date,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_tasks_firm_status_due_idx
  on public.staff_tasks(firm_id,status,due_date);
create index if not exists staff_tasks_assigned_idx
  on public.staff_tasks(assigned_to,status,due_date);
create index if not exists staff_tasks_client_idx
  on public.staff_tasks(client_id,created_at desc) where client_id is not null;
create index if not exists staff_tasks_return_idx
  on public.staff_tasks(tax_return_job_id,created_at desc) where tax_return_job_id is not null;
create index if not exists staff_tasks_created_by_idx
  on public.staff_tasks(created_by);

alter table public.staff_tasks enable row level security;

create or replace function private.validate_staff_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from clients c where c.id = new.client_id and c.firm_id = new.firm_id
  ) then raise exception 'Client must belong to the same firm'; end if;

  if new.tax_return_job_id is not null and not exists (
    select 1 from tax_return_jobs j
    where j.id = new.tax_return_job_id
      and j.firm_id = new.firm_id
      and (new.client_id is null or j.client_id = new.client_id)
  ) then raise exception 'Tax return must belong to the same firm and client'; end if;

  if new.assigned_to is not null and not exists (
    select 1 from profiles p
    where p.id = new.assigned_to and p.firm_id = new.firm_id
      and p.is_active and p.role in ('firm_admin','firm_staff')
  ) then raise exception 'Assignee must be active staff in the same firm'; end if;

  if not exists (
    select 1 from profiles p
    where p.id = new.created_by and p.firm_id = new.firm_id
      and p.is_active and p.role in ('firm_admin','firm_staff')
  ) then raise exception 'Creator must be active staff in the same firm'; end if;

  if new.status = 'done' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists staff_tasks_validate on public.staff_tasks;
create trigger staff_tasks_validate before insert or update on public.staff_tasks
for each row execute function private.validate_staff_task();

drop policy if exists "staff_tasks_select" on public.staff_tasks;
create policy "staff_tasks_select" on public.staff_tasks for select to authenticated
using (private.is_firm_staff() and firm_id = private.current_firm_id());

drop policy if exists "staff_tasks_insert" on public.staff_tasks;
create policy "staff_tasks_insert" on public.staff_tasks for insert to authenticated
with check (
  private.has_staff_permission('tasks.manage')
  and firm_id = private.current_firm_id()
  and created_by = (select auth.uid())
);

drop policy if exists "staff_tasks_update" on public.staff_tasks;
create policy "staff_tasks_update" on public.staff_tasks for update to authenticated
using (private.has_staff_permission('tasks.manage') and firm_id = private.current_firm_id())
with check (private.has_staff_permission('tasks.manage') and firm_id = private.current_firm_id());

drop policy if exists "staff_tasks_delete" on public.staff_tasks;
create policy "staff_tasks_delete" on public.staff_tasks for delete to authenticated
using (
  firm_id = private.current_firm_id()
  and (
    created_by = (select auth.uid())
    or exists (
      select 1 from profiles p
      where p.id = (select auth.uid())
        and p.is_active
        and p.firm_id = staff_tasks.firm_id
        and (p.role = 'firm_admin' or p.staff_role = 'manager')
    )
  )
);

grant select, insert, update, delete on public.staff_tasks to authenticated;

create or replace function private.audit_staff_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row staff_tasks;
  v_action text;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  v_action := case
    when tg_op = 'INSERT' then 'staff_task.created'
    when tg_op = 'DELETE' then 'staff_task.deleted'
    when new.status is distinct from old.status then 'staff_task.status_changed'
    else 'staff_task.updated'
  end;
  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_row.firm_id,auth.uid(),v_action,'staff_task',v_row.id,
    jsonb_build_object(
      'client_id',v_row.client_id,'tax_return_job_id',v_row.tax_return_job_id,
      'assigned_to',v_row.assigned_to,'status',v_row.status,
      'priority',v_row.priority,'due_date',v_row.due_date
    )
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists staff_tasks_audit on public.staff_tasks;
create trigger staff_tasks_audit after insert or update or delete on public.staff_tasks
for each row execute function private.audit_staff_task();

revoke all on function private.validate_staff_task(), private.audit_staff_task()
from public, anon, authenticated;
