-- Repair installations that already applied the engagement notification update.
-- Keep document-request events alongside engagement events; both workflows use
-- the same outbox. The original migration is also corrected so pending upgrades
-- do not fail when existing document-request notifications are present.
begin;

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check check (
    kind in (
      'message','client_message','engagement_sent','document_request','document_received',
      'organizer_sent','organizer_started','organizer_submitted','organizer_reviewed',
      'changes_requested','organizer_updated','tax_return_review_requested',
      'tax_return_review_changes_requested','tax_return_review_approved',
      'tax_return_copy_released','tax_return_copy_withdrawn'
    )
  );

commit;
