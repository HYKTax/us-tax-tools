alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check check (
    kind in (
      'message','client_message','engagement_sent','organizer_sent',
      'organizer_started','organizer_submitted','organizer_reviewed',
      'changes_requested','organizer_updated','tax_return_review_requested',
      'tax_return_review_changes_requested','tax_return_review_approved',
      'tax_return_copy_released','tax_return_copy_withdrawn'
    )
  );

create or replace function public.send_client_engagement(
  p_client_id uuid,
  p_template_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor profiles;
  v_client clients;
  v_template engagement_templates;
  v_id uuid;
begin
  select * into v_actor from profiles
  where id=auth.uid() and is_active;

  if v_actor.id is null or not private.has_staff_permission('clients.manage') then
    raise exception 'Not authorized';
  end if;

  select * into v_client from clients
  where id=p_client_id and firm_id=v_actor.firm_id and status='active';
  if v_client.id is null then raise exception 'Client not found'; end if;

  select * into v_template from engagement_templates
  where id=p_template_id and firm_id=v_actor.firm_id and is_active;
  if v_template.id is null then raise exception 'Template not found'; end if;

  insert into client_engagements(firm_id,client_id,template_id,title,body,sent_by)
  values(v_actor.firm_id,v_client.id,v_template.id,v_template.title,v_template.body,v_actor.id)
  returning id into v_id;

  insert into notifications(subject_client_id,target_client_id,recipient_email,kind,event_key,created_at)
  values(v_client.id,v_client.id,v_client.email,'engagement_sent','engagement-sent:'||v_id::text,now())
  on conflict(event_key) do nothing;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_actor.firm_id,v_actor.id,'engagement.sent','client_engagement',v_id,
    jsonb_build_object('client_id',v_client.id,'template_id',v_template.id)
  );

  return v_id;
end;
$$;

create or replace function public.send_engagements_batch(
  p_client_ids uuid[],
  p_template_id uuid
)
returns table(created_count integer, skipped_count integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor profiles;
  v_template engagement_templates;
  v_client clients;
  v_client_id uuid;
  v_id uuid;
  v_total integer;
  v_created integer:=0;
  v_skipped integer:=0;
begin
  select * into v_actor from profiles
  where id=auth.uid() and is_active;

  if v_actor.id is null or not private.has_staff_permission('clients.manage') then
    raise exception 'Not authorized';
  end if;

  select * into v_template from engagement_templates
  where id=p_template_id and firm_id=v_actor.firm_id and is_active;
  if v_template.id is null then raise exception 'Template not found'; end if;

  select count(*) into v_total
  from (select distinct unnest(p_client_ids) as id) x;

  if v_total=0 then raise exception 'Select at least one client'; end if;
  if v_total>200 then raise exception 'No more than 200 clients may be processed at once'; end if;

  if (
    select count(*)
    from clients c
    where c.id in (select distinct unnest(p_client_ids))
      and c.firm_id=v_actor.firm_id
      and c.status='active'
  ) <> v_total then
    raise exception 'One or more selected clients are unavailable';
  end if;

  for v_client_id in select distinct unnest(p_client_ids)
  loop
    if exists (
      select 1 from client_engagements e
      where e.client_id=v_client_id
        and e.template_id=v_template.id
        and e.status='sent'
    ) then
      v_skipped:=v_skipped+1;
      continue;
    end if;

    select * into v_client
    from clients
    where id=v_client_id and firm_id=v_actor.firm_id and status='active';

    insert into client_engagements(firm_id,client_id,template_id,title,body,sent_by)
    values(v_actor.firm_id,v_client.id,v_template.id,v_template.title,v_template.body,v_actor.id)
    returning id into v_id;

    insert into notifications(subject_client_id,target_client_id,recipient_email,kind,event_key,created_at)
    values(v_client.id,v_client.id,v_client.email,'engagement_sent','engagement-sent:'||v_id::text,now())
    on conflict(event_key) do nothing;

    insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
    values(
      v_actor.firm_id,v_actor.id,'engagement.sent','client_engagement',v_id,
      jsonb_build_object('client_id',v_client.id,'template_id',v_template.id,'batch',true)
    );

    v_created:=v_created+1;
  end loop;

  return query select v_created,v_skipped;
end;
$$;

revoke all on function public.send_engagements_batch(uuid[],uuid) from public,anon;
grant execute on function public.send_engagements_batch(uuid[],uuid) to authenticated;
