CREATE OR REPLACE FUNCTION public.post_client_message(p_client_id uuid, p_body text, p_request_id uuid)
 RETURNS client_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor profiles;
  v_client clients;
  v_message client_messages;
  v_existing client_messages;
  v_staff_id uuid;
  v_staff_email text;
  v_is_new boolean := false;
  v_body text;
begin
  select * into v_actor
  from profiles
  where id = auth.uid()
    and is_active;

  if v_actor.id is null then
    raise exception 'Not authorized';
  end if;

  if p_request_id is null then
    raise exception 'Request ID is required';
  end if;

  v_body := btrim(p_body);

  if coalesce(length(v_body), 0) = 0
     or length(v_body) > 5000 then
    raise exception 'Message must be between 1 and 5000 characters';
  end if;

  select * into v_client
  from clients
  where id = p_client_id;

  if v_client.id is null then
    raise exception 'Client not found';
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

  -- Validate a retry before attempting an insert. This makes request
  -- idempotency deterministic across PostgreSQL runtimes.
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

  insert into client_messages(
    firm_id,
    client_id,
    author_id,
    body,
    request_id
  )
  values(
    v_client.firm_id,
    v_client.id,
    v_actor.id,
    v_body,
    p_request_id
  )
  on conflict(author_id, request_id) do nothing
  returning * into v_message;

  if v_message.id is null then
    -- A concurrent request may have inserted the same idempotency key
    -- after our pre-check. Fetch and verify the winner.
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

  v_is_new := true;

  if v_is_new then
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
        select p.id, p.email
        into v_staff_id, v_staff_email
        from profiles p
        where p.id = v_client.created_by
          and p.firm_id = v_client.firm_id
          and p.is_active
          and p.role in ('firm_admin','firm_staff');
      end if;

      if v_staff_id is null then
        select p.id, p.email
        into v_staff_id, v_staff_email
        from profiles p
        where p.firm_id = v_client.firm_id
          and p.is_active
          and p.role in ('firm_admin','firm_staff')
        order by
          case
            when p.role = 'firm_admin' then 0
            when p.staff_role = 'manager' then 1
            else 2
          end,
          p.full_name
        limit 1;
      end if;

      if v_staff_id is not null and v_staff_email is not null then
        insert into notifications(
          subject_client_id,
          recipient_id,
          recipient_email,
          kind,
          event_key,
          created_at
        )
        values(
          v_client.id,
          v_staff_id,
          v_staff_email,
          'client_message',
          'client-message:' || v_message.id::text,
          v_message.created_at
        )
        on conflict(event_key) do nothing;
      end if;
    else
      insert into notifications(
        subject_client_id,
        target_client_id,
        recipient_email,
        kind,
        event_key,
        created_at
      )
      values(
        v_client.id,
        v_client.id,
        v_client.email,
        'client_message',
        'client-message:' || v_message.id::text,
        v_message.created_at
      )
      on conflict(event_key) do nothing;
    end if;

    insert into audit_log(
      firm_id,
      actor_id,
      action,
      target_type,
      target_id,
      metadata
    )
    values(
      v_client.firm_id,
      v_actor.id,
      'client_message.posted',
      'client',
      v_client.id,
      jsonb_build_object('message_id', v_message.id)
    );
  end if;

  return v_message;
end;
$function$

