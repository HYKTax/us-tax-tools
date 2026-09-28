create or replace function public.get_firm_usage_summary()
returns jsonb
language plpgsql
security definer
stable
set search_path=public
as $$
declare
  v_firm_id uuid;
  v_summary jsonb;
begin
  if not private.has_staff_permission('audit.view') then
    raise exception 'Not authorized';
  end if;

  v_firm_id:=private.current_firm_id();
  if v_firm_id is null then
    raise exception 'Firm account required';
  end if;

  select jsonb_build_object(
    'clients', (select count(*) from clients where firm_id=v_firm_id),
    'active_clients', (select count(*) from clients where firm_id=v_firm_id and status='active'),
    'documents', (select count(*) from documents where firm_id=v_firm_id),
    'document_bytes', (select coalesce(sum(size_bytes),0) from documents where firm_id=v_firm_id),
    'organizers', (select count(*) from organizers where firm_id=v_firm_id),
    'returns', (select count(*) from tax_return_jobs where firm_id=v_firm_id),
    'open_returns', (select count(*) from tax_return_jobs where firm_id=v_firm_id and status not in ('accepted','completed')),
    'tasks', (select count(*) from staff_tasks where firm_id=v_firm_id),
    'open_tasks', (select count(*) from staff_tasks where firm_id=v_firm_id and status <> 'done'),
    'client_messages', (select count(*) from client_messages where firm_id=v_firm_id),
    'engagements', (select count(*) from client_engagements where firm_id=v_firm_id),
    'document_requests', (select count(*) from document_requests where firm_id=v_firm_id),
    'top_storage_clients', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.bytes desc), '[]'::jsonb)
      from (
        select c.id,c.primary_contact_name as name,count(d.id)::bigint as documents,
               coalesce(sum(d.size_bytes),0)::bigint as bytes
        from clients c
        left join documents d on d.client_id=c.id and d.firm_id=v_firm_id
        where c.firm_id=v_firm_id
        group by c.id,c.primary_contact_name
        having count(d.id)>0
        order by bytes desc
        limit 10
      ) x
    ),
    'largest_files', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.bytes desc), '[]'::jsonb)
      from (
        select d.id,d.file_name as name,d.size_bytes::bigint as bytes,
               c.primary_contact_name as client_name,d.created_at
        from documents d
        join clients c on c.id=d.client_id
        where d.firm_id=v_firm_id and d.size_bytes is not null
        order by d.size_bytes desc
        limit 10
      ) x
    )
  ) into v_summary;

  return v_summary;
end;
$$;

revoke all on function public.get_firm_usage_summary() from public,anon;
grant execute on function public.get_firm_usage_summary() to authenticated;
