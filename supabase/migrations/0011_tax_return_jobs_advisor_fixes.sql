create index if not exists tax_return_jobs_organizer_id_idx
on public.tax_return_jobs(organizer_id);

create index if not exists tax_return_jobs_created_by_idx
on public.tax_return_jobs(created_by);

drop policy if exists "tax_return_jobs_staff_insert" on public.tax_return_jobs;
create policy "tax_return_jobs_staff_insert"
on public.tax_return_jobs
for insert
to authenticated
with check (
  private.is_firm_staff()
  and firm_id = private.current_firm_id()
  and created_by = (select auth.uid())
);
