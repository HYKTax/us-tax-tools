create or replace function private.validate_tax_return_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from clients c
    where c.id = new.client_id
      and c.firm_id = new.firm_id
  ) then
    raise exception 'Client must belong to the same firm';
  end if;

  if tg_op = 'INSERT'
     and exists (
       select 1
       from clients c
       where c.id = new.client_id
         and c.firm_id = new.firm_id
         and c.status = 'archived'
     ) then
    raise exception 'Archived clients cannot receive new tax-return work';
  end if;

  if new.organizer_id is not null and not exists (
    select 1
    from organizers o
    where o.id = new.organizer_id
      and o.firm_id = new.firm_id
      and o.client_id = new.client_id
  ) then
    raise exception 'Organizer must belong to this client and firm';
  end if;

  if new.created_by is null or not exists (
    select 1
    from profiles p
    where p.id = new.created_by
      and p.firm_id = new.firm_id
      and p.role in ('firm_admin','firm_staff')
      and p.is_active
  ) then
    raise exception 'Creator must be active staff in the same firm';
  end if;

  if new.preparer_id is not null
     and not private.can_be_preparer(new.preparer_id, new.firm_id) then
    raise exception 'Preparer must be an active Admin, Manager, or Preparer in the same firm';
  end if;

  if new.reviewer_id is not null
     and not private.can_be_reviewer(new.reviewer_id, new.firm_id) then
    raise exception 'Reviewer must be an active Admin, Manager, or Reviewer in the same firm';
  end if;

  if new.extension_status = 'filed' and new.extension_filed_at is null then
    new.extension_filed_at := now();
  elsif new.extension_status <> 'filed' then
    new.extension_filed_at := null;
  end if;

  if new.efile_status in ('transmitted','accepted','rejected')
     and new.efile_transmitted_at is null then
    new.efile_transmitted_at := now();
  end if;

  if new.efile_status = 'accepted' and new.efile_accepted_at is null then
    new.efile_accepted_at := now();
  elsif new.efile_status <> 'accepted' then
    new.efile_accepted_at := null;
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

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
  v_existing client_messages;
  v_staff_id uuid;
  v_staff_email text;
  v_body text;
begin
  select * into v_actor
  from profiles
  where id = auth.uid()
    and is_active;

  if v_actor.id is null then raise exception 'Not authorized'; end if;
  if p_request_id is null then raise exception 'Request ID is required'; end if;

  v_body := btrim(p_body);
  if coalesce(length(v_body), 0) = 0 or length(v_body) > 5000 then
    raise exception 'Message must be between 1 and 5000 characters';
  end if;

  select * into v_client from clients where id = p_client_id;
  if v_client.id is null then raise exception 'Client not found'; end if;
  if v_client.status = 'archived' then
    raise exception 'Archived clients cannot receive new messages';
  end if;

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

  select * into v_existing
  from client_messages
  where author_id = v_actor.id
    and request_id = p_request_id;

  if v_existing.id is not null then
    if v_existing.client_id is distinct from v_client.id
       or v_existing.body is distinct from v_body then
      raise exception 'Request ID does not match the original message';
    end if;
    return v_existing;
  end if;

  insert into client_messages(firm_id,client_id,author_id,body,request_id)
  values(v_client.firm_id,v_client.id,v_actor.id,v_body,p_request_id)
  on conflict(author_id, request_id) do nothing
  returning * into v_message;

  if v_message.id is null then
    select * into v_message
    from client_messages
    where author_id = v_actor.id
      and request_id = p_request_id;

    if v_message.id is null
       or v_message.client_id is distinct from v_client.id
       or v_message.body is distinct from v_body then
      raise exception 'Request ID does not match the original message';
    end if;

    return v_message;
  end if;

  if v_actor.role = 'client' then
    select p.id, p.email
    into v_staff_id, v_staff_email
    from profiles p
    where p.id = (
      select j.preparer_id
      from tax_return_jobs j
      join profiles assigned
        on assigned.id = j.preparer_id
       and assigned.is_active
       and assigned.firm_id = j.firm_id
       and assigned.role in ('firm_admin','firm_staff')
      where j.client_id = v_client.id
        and j.firm_id = v_client.firm_id
        and j.status <> 'completed'
      order by
        case when j.status in ('preparing','review','ready_to_file','e_filed') then 0 else 1 end,
        j.updated_at desc
      limit 1
    );

    if v_staff_id is null then
      select p.id,p.email into v_staff_id,v_staff_email
      from profiles p
      where p.id=v_client.created_by
        and p.firm_id=v_client.firm_id
        and p.is_active
        and p.role in ('firm_admin','firm_staff');
    end if;

    if v_staff_id is null then
      select p.id,p.email into v_staff_id,v_staff_email
      from profiles p
      where p.firm_id=v_client.firm_id
        and p.is_active
        and p.role in ('firm_admin','firm_staff')
      order by
        case when p.role='firm_admin' then 0 when p.staff_role='manager' then 1 else 2 end,
        p.full_name
      limit 1;
    end if;

    if v_staff_id is not null and v_staff_email is not null then
      insert into notifications(
        subject_client_id,recipient_id,recipient_email,kind,event_key,created_at
      )
      values(
        v_client.id,v_staff_id,v_staff_email,'client_message',
        'client-message:' || v_message.id::text,v_message.created_at
      )
      on conflict(event_key) do nothing;
    end if;
  else
    insert into notifications(
      subject_client_id,target_client_id,recipient_email,kind,event_key,created_at
    )
    values(
      v_client.id,v_client.id,v_client.email,'client_message',
      'client-message:' || v_message.id::text,v_message.created_at
    )
    on conflict(event_key) do nothing;
  end if;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_client.firm_id,v_actor.id,'client_message.posted','client',v_client.id,
    jsonb_build_object('message_id', v_message.id)
  );

  return v_message;
end;
$$;
