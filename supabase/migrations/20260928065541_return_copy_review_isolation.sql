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
  if new.document_kind = 'return_copy' then
    return new;
  end if;

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
  if new.document_kind = 'return_copy' then
    return new;
  end if;

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
  where id = p_job_id
    and firm_id = v_actor.firm_id
  for update;

  if v_job.id is null then raise exception 'Tax return not found'; end if;
  if v_job.status not in ('ready_to_prepare','preparing','extended','rejected') then
    raise exception 'Move the return into preparation before requesting review';
  end if;
  if v_job.preparer_id is null then raise exception 'Assign a preparer before requesting review'; end if;
  if v_job.reviewer_id is null then raise exception 'Assign a reviewer before requesting review'; end if;

  if exists (
    select 1 from tax_return_reviews
    where tax_return_job_id = v_job.id
      and status = 'requested'
  ) then
    raise exception 'This return already has an active review';
  end if;

  select * into v_reviewer
  from profiles
  where id = v_job.reviewer_id
    and firm_id = v_job.firm_id
    and is_active
  for share;

  if v_reviewer.id is null
     or not private.can_be_reviewer(v_reviewer.id, v_job.firm_id) then
    raise exception 'Assigned reviewer is not eligible to review this return';
  end if;

  if v_job.preparer_id = v_job.reviewer_id
     and v_reviewer.role <> 'firm_admin' then
    raise exception 'Preparer and reviewer must be different people unless the reviewer is a Firm Admin';
  end if;

  if exists (
    select 1
    from documents d
    where d.tax_return_job_id = v_job.id
      and d.document_kind <> 'return_copy'
      and d.status <> 'reviewed'
  ) then
    raise exception 'Complete source-document review before requesting final return review';
  end if;

  if exists (
    select 1
    from documents d
    join document_extractions e on e.document_id = d.id
    where d.tax_return_job_id = v_job.id
      and d.document_kind <> 'return_copy'
      and e.status = 'completed'
      and e.reviewed_at is null
  ) then
    raise exception 'Complete AI extraction review before requesting final return review';
  end if;

  select coalesce(max(cycle_number), 0) + 1
  into v_cycle
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
  set status = 'review',
      efile_status = 'not_ready'
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
  where id = p_review_id
    and firm_id = v_actor.firm_id
  for update;

  if v_review.id is null then raise exception 'Review not found'; end if;
  if v_review.status <> 'requested' then raise exception 'This review has already been resolved'; end if;

  select * into v_job
  from tax_return_jobs
  where id = v_review.tax_return_job_id
    and firm_id = v_review.firm_id
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
      select 1
      from documents d
      where d.tax_return_job_id = v_job.id
        and d.document_kind <> 'return_copy'
        and d.status <> 'reviewed'
    ) then
      raise exception 'Review every linked source document before approving the return';
    end if;

    if exists (
      select 1
      from documents d
      join document_extractions e on e.document_id = d.id
      where d.tax_return_job_id = v_job.id
        and d.document_kind <> 'return_copy'
        and e.status = 'completed'
        and e.reviewed_at is null
    ) then
      raise exception 'Review completed AI extraction data before approving the return';
    end if;

    update tax_return_reviews
    set status = 'approved',
        resolution_note = nullif(btrim(p_note), ''),
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = v_review.id;

    update tax_return_jobs
    set status = 'ready_to_file',
        efile_status = 'ready'
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
