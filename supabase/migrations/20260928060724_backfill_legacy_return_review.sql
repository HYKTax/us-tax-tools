insert into public.tax_return_reviews (
  firm_id,
  tax_return_job_id,
  cycle_number,
  return_version,
  requested_by,
  assigned_reviewer_id,
  status,
  request_note,
  requested_at
)
select
  j.firm_id,
  j.id,
  1,
  j.review_version,
  coalesce(j.preparer_id, j.created_by),
  j.reviewer_id,
  'requested',
  'Migrated from the legacy In review workflow state.',
  coalesce(j.updated_at, j.created_at, now())
from public.tax_return_jobs j
where j.status = 'review'
  and j.reviewer_id is not null
  and not exists (
    select 1
    from public.tax_return_reviews r
    where r.tax_return_job_id = j.id
  );

update public.tax_return_jobs j
set status = 'preparing'
where j.status = 'review'
  and (
    j.reviewer_id is null
    or not exists (
      select 1
      from public.tax_return_reviews r
      where r.tax_return_job_id = j.id
        and r.status = 'requested'
    )
  );
