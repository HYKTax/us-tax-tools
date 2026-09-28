create or replace function public.get_client_return_status()
returns table (
  id uuid,
  tax_year integer,
  return_type text,
  client_stage text,
  due_date date,
  extension_status text,
  efile_status text,
  efile_transmitted_at timestamptz,
  efile_accepted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz
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
    j.id,
    j.tax_year,
    j.return_type,
    case
      when j.status = 'waiting_on_client' then 'action_needed'
      when j.status in ('ready_to_prepare','preparing') then 'preparing'
      when j.status = 'review' then 'review'
      when j.status = 'waiting_on_signature' then 'signature_needed'
      when j.status = 'ready_to_file' then 'ready_to_file'
      when j.status = 'e_filed' then 'filed'
      when j.status = 'accepted' then 'accepted'
      when j.status = 'rejected' then 'filing_issue'
      when j.status = 'extended' then 'extended'
      when j.status = 'completed' then 'completed'
      else 'preparing'
    end as client_stage,
    j.due_date,
    j.extension_status,
    j.efile_status,
    j.efile_transmitted_at,
    j.efile_accepted_at,
    j.completed_at,
    j.updated_at
  from tax_return_jobs j
  where j.client_id = v_client_id
    and j.status <> 'not_started'
  order by j.tax_year desc, j.updated_at desc;
end;
$$;

revoke all on function public.get_client_return_status() from public, anon;
grant execute on function public.get_client_return_status() to authenticated;
