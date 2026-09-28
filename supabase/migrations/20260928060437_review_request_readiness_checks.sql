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
      and d.status <> 'reviewed'
  ) then
    raise exception 'Complete source-document review before requesting final return review';
  end if;

  if exists (
    select 1
    from documents d
    join document_extractions e on e.document_id = d.id
    where d.tax_return_job_id = v_job.id
      and e.status = 'completed'
      and e.reviewed_at is null
  ) then
    raise exception 'Complete AI extraction review before requesting final return review';
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
