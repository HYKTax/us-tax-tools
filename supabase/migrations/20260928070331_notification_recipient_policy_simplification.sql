drop policy if exists "notifications_select_recipient" on public.notifications;

create policy "notifications_select_recipient"
on public.notifications
for select
to authenticated
using (
  recipient_id = (select auth.uid())
  or target_client_id = private.current_client_id()
);
