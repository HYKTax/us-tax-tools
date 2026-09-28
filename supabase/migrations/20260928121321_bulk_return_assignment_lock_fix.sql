create or replace function public.bulk_update_tax_return_jobs(
  p_job_ids uuid[],
  p_priority text default null,
  p_preparer_mode text default 'keep',
  p_preparer_id uuid default null,
  p_reviewer_mode text default 'keep',
  p_reviewer_id uuid default null,
  p_due_date_mode text default 'keep',
  p_due_date date default null
)
returns table(updated_count integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor profiles;
  v_ids uuid[];
  v_job tax_return_jobs;
  v_priority text;
  v_preparer_id uuid;
  v_reviewer_id uuid;
  v_due_date date;
  v_updated integer := 0;
begin
  select * into v_actor from profiles where id=auth.uid();

  if v_actor.id is null
     or not v_actor.is_active
     or not private.has_staff_permission('returns.manage') then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(distinct id),'{}'::uuid[])
  into v_ids
  from unnest(coalesce(p_job_ids,'{}'::uuid[])) as id
  where id is not null;

  if cardinality(v_ids)=0 then raise exception 'Select at least one tax return'; end if;
  if cardinality(v_ids)>200 then raise exception 'Update no more than 200 tax returns at a time'; end if;

  if p_priority is not null and p_priority not in ('low','normal','high','urgent') then
    raise exception 'Invalid priority';
  end if;
  if p_preparer_mode not in ('keep','set','clear') then raise exception 'Invalid preparer mode'; end if;
  if p_reviewer_mode not in ('keep','set','clear') then raise exception 'Invalid reviewer mode'; end if;
  if p_due_date_mode not in ('keep','set','clear') then raise exception 'Invalid due date mode'; end if;

  if p_preparer_mode='set' and p_preparer_id is null then raise exception 'Choose a preparer'; end if;
  if p_reviewer_mode='set' and p_reviewer_id is null then raise exception 'Choose a reviewer'; end if;
  if p_due_date_mode='set' and p_due_date is null then raise exception 'Choose a due date'; end if;

  if p_priority is null
     and p_preparer_mode='keep'
     and p_reviewer_mode='keep'
     and p_due_date_mode='keep' then
    raise exception 'Choose at least one field to update';
  end if;

  if (
    select count(*) from tax_return_jobs j
    where j.id=any(v_ids) and j.firm_id=v_actor.firm_id
  ) <> cardinality(v_ids) then
    raise exception 'One or more tax returns are unavailable';
  end if;

  for v_job in
    select * from tax_return_jobs
    where id=any(v_ids) and firm_id=v_actor.firm_id
    order by id
  loop
    v_priority := coalesce(p_priority,v_job.priority);
    v_preparer_id := case p_preparer_mode
      when 'set' then p_preparer_id
      when 'clear' then null
      else v_job.preparer_id
    end;
    v_reviewer_id := case p_reviewer_mode
      when 'set' then p_reviewer_id
      when 'clear' then null
      else v_job.reviewer_id
    end;
    v_due_date := case p_due_date_mode
      when 'set' then p_due_date
      when 'clear' then null
      else v_job.due_date
    end;

    perform public.update_tax_return_job(
      v_job.id,
      v_job.status,
      v_priority,
      v_due_date,
      v_preparer_id,
      v_reviewer_id,
      v_job.extension_status,
      v_job.efile_status
    );

    v_updated := v_updated+1;
  end loop;

  return query select v_updated;
end;
$$;
