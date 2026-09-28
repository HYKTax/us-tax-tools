alter table public.tax_return_jobs
  add column if not exists review_version integer not null default 1
  check (review_version >= 1);

create table public.tax_return_reviews (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  tax_return_job_id uuid not null references public.tax_return_jobs(id) on delete cascade,
  cycle_number integer not null check (cycle_number >= 1),
  return_version integer not null check (return_version >= 1),
  requested_by uuid not null references public.profiles(id),
  assigned_reviewer_id uuid not null references public.profiles(id),
  status text not null default 'requested'
    check (status in ('requested','changes_requested','approved')),
  request_note text,
  resolution_note text,
  requested_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tax_return_job_id, cycle_number)
);

create index tax_return_reviews_job_idx
  on public.tax_return_reviews(tax_return_job_id, cycle_number desc);
create index tax_return_reviews_firm_status_idx
  on public.tax_return_reviews(firm_id, status, requested_at desc);
create index tax_return_reviews_requested_by_idx
  on public.tax_return_reviews(requested_by);
create index tax_return_reviews_assigned_reviewer_idx
  on public.tax_return_reviews(assigned_reviewer_id, status);
create index tax_return_reviews_resolved_by_idx
  on public.tax_return_reviews(resolved_by);

create trigger tax_return_reviews_set_updated_at
before update on public.tax_return_reviews
for each row execute function private.set_updated_at();

alter table public.tax_return_reviews enable row level security;

create policy "tax_return_reviews_staff_select"
on public.tax_return_reviews
for select
to authenticated
using (
  private.is_firm_staff()
  and firm_id = private.current_firm_id()
);

revoke all on public.tax_return_reviews from anon, authenticated;
grant select on public.tax_return_reviews to authenticated;

create or replace function private.has_current_return_approval(p_job_id uuid, p_version integer)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from tax_return_reviews r
    where r.tax_return_job_id = p_job_id
      and r.return_version = p_version
      and r.status = 'approved'
  );
$$;

create or replace function public.update_tax_return_job(
  p_id uuid,
  p_status text,
  p_priority text,
  p_due_date date,
  p_preparer_id uuid,
  p_reviewer_id uuid,
  p_extension_status text,
  p_efile_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_job tax_return_jobs;
  v_open_review tax_return_reviews;
  v_has_approval boolean;
  v_new_status text;
  v_new_efile_status text;
  v_new_version integer;
  v_invalidate boolean := false;
begin
  select * into v_actor from profiles where id = auth.uid();

  if v_actor.id is null
     or not v_actor.is_active
     or not private.has_staff_permission('returns.manage') then
    raise exception 'Not authorized';
  end if;

  if p_status not in (
    'not_started','waiting_on_client','ready_to_prepare','preparing','review',
    'waiting_on_signature','ready_to_file','e_filed','accepted','rejected',
    'extended','completed'
  ) then raise exception 'Invalid workflow status'; end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'Invalid priority'; end if;
  if p_extension_status not in ('not_needed','planned','filed') then raise exception 'Invalid extension status'; end if;
  if p_efile_status not in ('not_ready','ready','transmitted','accepted','rejected') then raise exception 'Invalid e-file status'; end if;

  select * into v_job
  from tax_return_jobs
  where id = p_id and firm_id = v_actor.firm_id
  for update;

  if v_job.id is null then raise exception 'Tax return not found'; end if;

  if p_preparer_id is not null
     and not private.can_be_preparer(p_preparer_id, v_job.firm_id) then
    raise exception 'Choose an active Admin, Manager, or Preparer';
  end if;

  if p_reviewer_id is not null
     and not private.can_be_reviewer(p_reviewer_id, v_job.firm_id) then
    raise exception 'Choose an active Admin, Manager, or Reviewer';
  end if;

  select * into v_open_review
  from tax_return_reviews
  where tax_return_job_id = v_job.id and status = 'requested'
  order by cycle_number desc
  limit 1
  for update;

  if v_open_review.id is not null and (
       p_status is distinct from v_job.status
       or p_preparer_id is distinct from v_job.preparer_id
       or p_reviewer_id is distinct from v_job.reviewer_id
       or p_efile_status is distinct from v_job.efile_status
     ) then
    raise exception 'Resolve the active review before changing workflow, assignments, or e-file status';
  end if;

  if p_status = 'review' then
    raise exception 'Use Request review to move a return into review';
  end if;

  v_has_approval := private.has_current_return_approval(v_job.id, v_job.review_version);
  v_new_status := p_status;
  v_new_efile_status := p_efile_status;
  v_new_version := v_job.review_version;

  if p_status in ('waiting_on_signature','ready_to_file','e_filed','accepted','completed')
     and not v_has_approval then
    raise exception 'Reviewer approval is required before filing workflow can continue';
  end if;

  if p_efile_status in ('ready','transmitted','accepted','rejected')
     and not v_has_approval then
    raise exception 'Reviewer approval is required before e-file workflow can continue';
  end if;

  if v_has_approval and (
       (
         v_job.status in ('waiting_on_signature','ready_to_file','e_filed','accepted','completed')
         and p_status in ('not_started','waiting_on_client','ready_to_prepare','preparing','extended','rejected')
       )
       or p_preparer_id is distinct from v_job.preparer_id
       or p_reviewer_id is distinct from v_job.reviewer_id
     ) then
    v_invalidate := true;
  end if;

  if p_efile_status = 'transmitted' then
    v_new_status := 'e_filed';
  elsif p_efile_status = 'accepted' then
    v_new_status := 'accepted';
  elsif p_efile_status = 'rejected' then
    v_new_status := 'rejected';
    if v_job.efile_status is distinct from 'rejected' then
      v_invalidate := true;
    end if;
  end if;

  if v_invalidate then
    v_new_version := v_job.review_version + 1;
    if v_new_status not in ('rejected','preparing','ready_to_prepare','waiting_on_client','not_started','extended') then
      v_new_status := 'preparing';
    end if;
    if p_efile_status <> 'rejected' then
      v_new_efile_status := 'not_ready';
    end if;

    insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
    values (
      v_job.firm_id,auth.uid(),'tax_return.review_invalidated','tax_return_job',v_job.id,
      jsonb_build_object('old_review_version',v_job.review_version,'new_review_version',v_new_version)
    );
  end if;

  update tax_return_jobs
  set status = v_new_status,
      priority = p_priority,
      due_date = p_due_date,
      preparer_id = p_preparer_id,
      reviewer_id = p_reviewer_id,
      extension_status = p_extension_status,
      efile_status = v_new_efile_status,
      review_version = v_new_version
  where id = v_job.id;
end;
$$;

create or replace function public.request_tax_return_review(
  p_job_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_job tax_return_jobs;
  v_reviewer profiles;
  v_cycle integer;
  v_review_id uuid;
begin
  select * into v_actor from profiles where id = auth.uid();

  if v_actor.id is null
     or not v_actor.is_active
     or not private.has_staff_permission('returns.manage') then
    raise exception 'Not authorized';
  end if;

  if p_note is not null and length(btrim(p_note)) > 5000 then
    raise exception 'Review note is too long';
  end if;

  select * into v_job
  from tax_return_jobs
  where id = p_job_id and firm_id = v_actor.firm_id
  for update;

  if v_job.id is null then raise exception 'Tax return not found'; end if;

  if v_job.status not in ('ready_to_prepare','preparing','extended','rejected') then
    raise exception 'Move the return into preparation before requesting review';
  end if;

  if v_job.preparer_id is null then raise exception 'Assign a preparer before requesting review'; end if;
  if v_job.reviewer_id is null then raise exception 'Assign a reviewer before requesting review'; end if;

  if exists (
    select 1 from tax_return_reviews
    where tax_return_job_id = v_job.id and status = 'requested'
  ) then
    raise exception 'This return already has an active review';
  end if;

  select * into v_reviewer
  from profiles
  where id = v_job.reviewer_id and firm_id = v_job.firm_id and is_active
  for share;

  if v_reviewer.id is null or not private.can_be_reviewer(v_reviewer.id, v_job.firm_id) then
    raise exception 'Assigned reviewer is not eligible to review this return';
  end if;

  if v_job.preparer_id = v_job.reviewer_id
     and v_reviewer.role <> 'firm_admin' then
    raise exception 'Preparer and reviewer must be different people unless the reviewer is a Firm Admin';
  end if;

  if exists (
    select 1
    from tax_return_source_values s
    where s.tax_return_job_id = v_job.id
    group by s.field_name
    having count(distinct s.value) > 1
  ) then
    raise exception 'Resolve approved source-data conflicts before requesting review';
  end if;

  select coalesce(max(cycle_number), 0) + 1 into v_cycle
  from tax_return_reviews
  where tax_return_job_id = v_job.id;

  insert into tax_return_reviews (
    firm_id,tax_return_job_id,cycle_number,return_version,requested_by,
    assigned_reviewer_id,status,request_note
  )
  values (
    v_job.firm_id,v_job.id,v_cycle,v_job.review_version,auth.uid(),
    v_job.reviewer_id,'requested',nullif(btrim(p_note), '')
  )
  returning id into v_review_id;

  update tax_return_jobs
  set status = 'review', efile_status = 'not_ready'
  where id = v_job.id;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values (
    v_job.firm_id,auth.uid(),'tax_return.review_requested','tax_return_job',v_job.id,
    jsonb_build_object(
      'review_id',v_review_id,'cycle_number',v_cycle,
      'review_version',v_job.review_version,'reviewer_id',v_job.reviewer_id
    )
  );

  return v_review_id;
end;
$$;

create or replace function public.resolve_tax_return_review(
  p_review_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_review tax_return_reviews;
  v_job tax_return_jobs;
  v_can_override boolean;
begin
  select * into v_actor from profiles where id = auth.uid();

  if v_actor.id is null
     or not v_actor.is_active
     or not private.has_staff_permission('returns.review') then
    raise exception 'Not authorized';
  end if;

  if p_decision not in ('approved','changes_requested') then
    raise exception 'Invalid review decision';
  end if;

  if p_note is not null and length(btrim(p_note)) > 5000 then
    raise exception 'Review note is too long';
  end if;

  if p_decision = 'changes_requested'
     and coalesce(length(btrim(p_note)), 0) = 0 then
    raise exception 'Enter review notes before requesting changes';
  end if;

  select * into v_review
  from tax_return_reviews
  where id = p_review_id and firm_id = v_actor.firm_id
  for update;

  if v_review.id is null then raise exception 'Review not found'; end if;
  if v_review.status <> 'requested' then raise exception 'This review has already been resolved'; end if;

  select * into v_job
  from tax_return_jobs
  where id = v_review.tax_return_job_id and firm_id = v_review.firm_id
  for update;

  if v_job.id is null then raise exception 'Tax return not found'; end if;

  if v_job.review_version <> v_review.return_version then
    raise exception 'The return changed after review was requested. Request a new review';
  end if;

  v_can_override := v_actor.role = 'firm_admin' or v_actor.staff_role = 'manager';

  if auth.uid() <> v_review.assigned_reviewer_id and not v_can_override then
    raise exception 'Only the assigned reviewer, Manager, or Firm Admin can resolve this review';
  end if;

  if auth.uid() = v_job.preparer_id and v_actor.role <> 'firm_admin' then
    raise exception 'The preparer cannot approve or resolve their own return review';
  end if;

  if p_decision = 'approved' then
    if exists (
      select 1 from documents d
      where d.tax_return_job_id = v_job.id and d.status <> 'reviewed'
    ) then
      raise exception 'Review every linked source document before approving the return';
    end if;

    if exists (
      select 1
      from documents d
      join document_extractions e on e.document_id = d.id
      where d.tax_return_job_id = v_job.id
        and e.status = 'completed'
        and e.reviewed_at is null
    ) then
      raise exception 'Review completed AI extraction data before approving the return';
    end if;

    if exists (
      select 1
      from tax_return_source_values s
      where s.tax_return_job_id = v_job.id
      group by s.field_name
      having count(distinct s.value) > 1
    ) then
      raise exception 'Resolve approved source-data conflicts before approving the return';
    end if;

    update tax_return_reviews
    set status = 'approved',
        resolution_note = nullif(btrim(p_note), ''),
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = v_review.id;

    update tax_return_jobs
    set status = 'ready_to_file', efile_status = 'ready'
    where id = v_job.id;
  else
    update tax_return_reviews
    set status = 'changes_requested',
        resolution_note = btrim(p_note),
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = v_review.id;

    update tax_return_jobs
    set status = 'preparing',
        efile_status = 'not_ready',
        review_version = review_version + 1
    where id = v_job.id;
  end if;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values (
    v_job.firm_id,auth.uid(),
    case when p_decision = 'approved'
      then 'tax_return.review_approved'
      else 'tax_return.review_changes_requested'
    end,
    'tax_return_job',v_job.id,
    jsonb_build_object(
      'review_id',v_review.id,'cycle_number',v_review.cycle_number,
      'review_version',v_review.return_version
    )
  );
end;
$$;

drop policy if exists "tax_return_jobs_staff_update" on public.tax_return_jobs;
revoke update on public.tax_return_jobs from authenticated;

revoke all on function private.has_current_return_approval(uuid,integer)
from public, anon, authenticated;
grant execute on function private.has_current_return_approval(uuid,integer)
to authenticated;

revoke all on function public.update_tax_return_job(uuid,text,text,date,uuid,uuid,text,text)
from public, anon;
grant execute on function public.update_tax_return_job(uuid,text,text,date,uuid,uuid,text,text)
to authenticated;

revoke all on function public.request_tax_return_review(uuid,text)
from public, anon;
grant execute on function public.request_tax_return_review(uuid,text)
to authenticated;

revoke all on function public.resolve_tax_return_review(uuid,text,text)
from public, anon;
grant execute on function public.resolve_tax_return_review(uuid,text,text)
to authenticated;
