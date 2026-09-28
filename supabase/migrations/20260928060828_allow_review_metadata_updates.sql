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

  if p_status = 'review'
     and not (
       v_job.status = 'review'
       and v_open_review.id is not null
       and p_status = v_job.status
     ) then
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
