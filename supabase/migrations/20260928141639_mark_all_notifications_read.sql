create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
begin
  update notifications n
  set read_at=coalesce(n.read_at,now())
  where n.read_at is null
    and (
      n.recipient_id=auth.uid()
      or n.target_client_id=private.current_client_id()
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public,anon;
grant execute on function public.mark_all_notifications_read() to authenticated;
