alter function private.client_stage_for_return_status(text)
set search_path = public;

create index if not exists tax_return_status_history_changed_by_idx
  on public.tax_return_status_history(changed_by);

create index if not exists tax_return_status_history_firm_id_idx
  on public.tax_return_status_history(firm_id);
