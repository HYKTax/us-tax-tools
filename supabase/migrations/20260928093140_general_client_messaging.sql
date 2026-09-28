create table if not exists public.client_messages (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 5000),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique(author_id, request_id)
);

create index if not exists client_messages_client_created_idx
  on public.client_messages(client_id, created_at desc);
create index if not exists client_messages_firm_created_idx
  on public.client_messages(firm_id, created_at desc);

alter table public.client_messages enable row level security;

drop policy if exists "client_messages_select_authorized" on public.client_messages;
create policy "client_messages_select_authorized"
on public.client_messages for select to authenticated
using (
  (private.is_firm_staff() and firm_id = private.current_firm_id())
  or client_id = private.current_client_id()
);

revoke all on public.client_messages from anon, authenticated;
grant select on public.client_messages to authenticated;

alter table public.notifications
  add column if not exists subject_client_id uuid
  references public.clients(id) on delete cascade;

create index if not exists notifications_subject_client_idx
  on public.notifications(subject_client_id, created_at desc)
  where subject_client_id is not null;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'message','client_message','organizer_sent','organizer_started',
    'organizer_submitted','organizer_reviewed','changes_requested',
    'organizer_updated','tax_return_review_requested',
    'tax_return_review_changes_requested','tax_return_review_approved',
    'tax_return_copy_released','tax_return_copy_withdrawn'
  )
);

alter table public.notifications drop constraint if exists notifications_subject_check;
alter table public.notifications add constraint notifications_subject_check
check (num_nonnulls(organizer_id, tax_return_job_id, subject_client_id) = 1);

revoke select on public.notifications from authenticated;
grant select(id,organizer_id,tax_return_job_id,subject_client_id,kind,created_at,read_at)
on public.notifications to authenticated;

create or replace function public.post_client_message(
  p_client_id uuid,
  p_body text,
  p_request_id uuid
)
returns public.client_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_client clients;
  v_message client_messages;
  v_staff_id uuid;
  v_staff_email text;
  v_is_new boolean := false;
begin
  select * into v_actor from profiles where id = auth.uid() and is_active;
  if v_actor.id is null then raise exception 'Not authorized'; end if;
  if p_request_id is null then raise exception 'Request ID is required'; end if;
  if coalesce(length(btrim(p_body)), 0) = 0 or length(btrim(p_body)) > 5000 then
    raise exception 'Message must be between 1 and 5000 characters';
  end if;

  select * into v_client from clients where id = p_client_id;
  if v_client.id is null then raise exception 'Client not found'; end if;

  if v_actor.role = 'client' then
    if v_client.profile_id is distinct from v_actor.id then
      raise exception 'Not authorized to message for this client';
    end if;
  elsif v_actor.role in ('firm_admin','firm_staff') then
    if v_client.firm_id is distinct from v_actor.firm_id then
      raise exception 'Client not found';
    end if;
  else
    raise exception 'Not authorized';
  end if;

  insert into client_messages(firm_id,client_id,author_id,body,request_id)
  values(v_client.firm_id,v_client.id,v_actor.id,btrim(p_body),p_request_id)
  on conflict(author_id, request_id) do nothing
  returning * into v_message;

  if v_message.id is not null then
    v_is_new := true;
  else
    select * into v_message from client_messages
    where author_id = v_actor.id and request_id = p_request_id;
    if v_message.id is null
       or v_message.client_id is distinct from v_client.id
       or v_message.body is distinct from btrim(p_body) then
      raise exception 'Request ID does not match the original message';
    end if;
  end if;

  if v_is_new then
    if v_actor.role = 'client' then
      select p.id,p.email into v_staff_id,v_staff_email
      from profiles p
      where p.id = (
        select j.preparer_id
        from tax_return_jobs j
        join profiles assigned on assigned.id=j.preparer_id
          and assigned.is_active and assigned.firm_id=j.firm_id
          and assigned.role in ('firm_admin','firm_staff')
        where j.client_id=v_client.id and j.firm_id=v_client.firm_id
          and j.status <> 'completed'
        order by case when j.status in ('preparing','review','ready_to_file','e_filed') then 0 else 1 end,
                 j.updated_at desc
        limit 1
      );

      if v_staff_id is null then
        select p.id,p.email into v_staff_id,v_staff_email
        from profiles p
        where p.id=v_client.created_by and p.firm_id=v_client.firm_id
          and p.is_active and p.role in ('firm_admin','firm_staff');
      end if;

      if v_staff_id is null then
        select p.id,p.email into v_staff_id,v_staff_email
        from profiles p
        where p.firm_id=v_client.firm_id and p.is_active
          and p.role in ('firm_admin','firm_staff')
        order by case when p.role='firm_admin' then 0 when p.staff_role='manager' then 1 else 2 end,
                 p.full_name
        limit 1;
      end if;

      if v_staff_id is not null and v_staff_email is not null then
        insert into notifications(subject_client_id,recipient_id,recipient_email,kind,event_key,created_at)
        values(v_client.id,v_staff_id,v_staff_email,'client_message',
               'client-message:'||v_message.id::text,v_message.created_at)
        on conflict(event_key) do nothing;
      end if;
    else
      insert into notifications(subject_client_id,target_client_id,recipient_email,kind,event_key,created_at)
      values(v_client.id,v_client.id,v_client.email,'client_message',
             'client-message:'||v_message.id::text,v_message.created_at)
      on conflict(event_key) do nothing;
    end if;

    insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
    values(v_client.firm_id,v_actor.id,'client_message.posted','client',v_client.id,
           jsonb_build_object('message_id',v_message.id));
  end if;

  return v_message;
end;
$$;

create or replace function public.mark_client_message_notifications_read(
  p_client_id uuid,
  p_through timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from clients c
    where c.id=p_client_id and (
      c.id=private.current_client_id()
      or (private.is_firm_staff() and c.firm_id=private.current_firm_id())
    )
  ) then return; end if;

  update notifications n set read_at=coalesce(n.read_at,now())
  where n.subject_client_id=p_client_id
    and n.kind='client_message'
    and n.created_at<=p_through
    and (n.recipient_id=auth.uid() or n.target_client_id=private.current_client_id());
end;
$$;

revoke all on function public.post_client_message(uuid,text,uuid),
  public.mark_client_message_notifications_read(uuid,timestamptz)
from public, anon;
grant execute on function public.post_client_message(uuid,text,uuid),
  public.mark_client_message_notifications_read(uuid,timestamptz)
to authenticated;
