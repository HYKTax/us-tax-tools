alter table public.notifications
  add column if not exists tax_return_job_id uuid references public.tax_return_jobs(id) on delete cascade;

alter table public.notifications
  alter column organizer_id drop not null;

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check check (
    kind in (
      'message',
      'organizer_sent',
      'organizer_started',
      'organizer_submitted',
      'organizer_reviewed',
      'changes_requested',
      'organizer_updated',
      'tax_return_review_requested',
      'tax_return_review_changes_requested',
      'tax_return_review_approved'
    )
  );

alter table public.notifications
  drop constraint if exists notifications_subject_check;

alter table public.notifications
  add constraint notifications_subject_check
  check (num_nonnulls(organizer_id, tax_return_job_id) = 1);

create index if not exists notifications_return_idx
  on public.notifications(tax_return_job_id, created_at desc)
  where tax_return_job_id is not null;

drop policy if exists "notifications_select_recipient" on public.notifications;
create policy "notifications_select_recipient"
on public.notifications
for select
to authenticated
using (
  (
    recipient_id = (select auth.uid())
    or target_client_id = private.current_client_id()
  )
  and (
    (
      organizer_id is not null
      and exists (
        select 1 from public.organizers o
        where o.id = notifications.organizer_id
      )
    )
    or (
      tax_return_job_id is not null
      and exists (
        select 1 from public.tax_return_jobs j
        where j.id = notifications.tax_return_job_id
      )
    )
  )
);

revoke select on public.notifications from authenticated;
grant select(id, organizer_id, tax_return_job_id, kind, created_at, read_at)
on public.notifications to authenticated;

create or replace function private.queue_tax_return_notification(
  p_job_id uuid,
  p_recipient_id uuid,
  p_kind text,
  p_event_key text,
  p_created_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job tax_return_jobs;
  v_email text;
begin
  select * into strict v_job
  from tax_return_jobs
  where id = p_job_id;

  select email into v_email
  from profiles
  where id = p_recipient_id
    and firm_id = v_job.firm_id
    and role in ('firm_admin','firm_staff')
    and is_active;

  if v_email is not null then
    insert into notifications(
      tax_return_job_id,
      recipient_id,
      recipient_email,
      kind,
      event_key,
      created_at
    )
    values(
      v_job.id,
      p_recipient_id,
      v_email,
      p_kind,
      p_event_key,
      p_created_at
    )
    on conflict(event_key) do nothing;
  end if;
end;
$$;

create or replace function private.notify_tax_return_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job tax_return_jobs;
begin
  select * into v_job
  from tax_return_jobs
  where id = new.tax_return_job_id;

  if tg_op = 'INSERT' and new.status = 'requested' then
    if new.assigned_reviewer_id is distinct from new.requested_by then
      perform private.queue_tax_return_notification(
        new.tax_return_job_id,
        new.assigned_reviewer_id,
        'tax_return_review_requested',
        'tax-return-review-requested:' || new.id::text,
        new.requested_at
      );
    end if;

  elsif tg_op = 'UPDATE'
    and new.status is distinct from old.status
    and new.status in ('approved','changes_requested') then

    if v_job.preparer_id is not null
       and v_job.preparer_id is distinct from new.resolved_by then
      perform private.queue_tax_return_notification(
        new.tax_return_job_id,
        v_job.preparer_id,
        case
          when new.status = 'approved' then 'tax_return_review_approved'
          else 'tax_return_review_changes_requested'
        end,
        'tax-return-review-resolved:' || new.id::text || ':preparer',
        coalesce(new.resolved_at, now())
      );
    end if;

    if new.requested_by is distinct from v_job.preparer_id
       and new.requested_by is distinct from new.resolved_by then
      perform private.queue_tax_return_notification(
        new.tax_return_job_id,
        new.requested_by,
        case
          when new.status = 'approved' then 'tax_return_review_approved'
          else 'tax_return_review_changes_requested'
        end,
        'tax-return-review-resolved:' || new.id::text || ':requester',
        coalesce(new.resolved_at, now())
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tax_return_reviews_notify on public.tax_return_reviews;
create trigger tax_return_reviews_notify
after insert or update of status on public.tax_return_reviews
for each row execute function private.notify_tax_return_review();

revoke all on function private.queue_tax_return_notification(uuid,uuid,text,text,timestamptz),
  private.notify_tax_return_review()
from public, anon, authenticated;
