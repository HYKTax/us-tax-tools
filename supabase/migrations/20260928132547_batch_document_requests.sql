create or replace function public.create_document_requests_batch(
  p_client_ids uuid[],
  p_title text,
  p_details text default null,
  p_due_date date default null
)
returns table(created_count integer, skipped_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_client clients;
  v_request document_requests;
  v_created integer := 0;
  v_skipped integer := 0;
  v_requested integer;
  v_valid integer;
begin
  select * into v_actor from profiles where id = auth.uid() and is_active;
  if v_actor.id is null or not private.has_staff_permission('documents.manage') then
    raise exception 'Not authorized';
  end if;

  if p_client_ids is null or cardinality(p_client_ids) = 0 then
    raise exception 'Select at least one client';
  end if;
  if cardinality(p_client_ids) > 200 then
    raise exception 'Create no more than 200 document requests at a time';
  end if;
  if coalesce(length(btrim(p_title)),0) = 0 or length(btrim(p_title)) > 240 then
    raise exception 'Request title must be between 1 and 240 characters';
  end if;
  if p_details is not null and length(p_details) > 5000 then
    raise exception 'Request details must be 5000 characters or fewer';
  end if;

  select count(distinct id) into v_requested from unnest(p_client_ids) id;
  select count(*) into v_valid
  from clients c
  where c.id = any(p_client_ids)
    and c.firm_id = v_actor.firm_id
    and c.status <> 'archived';

  if v_valid <> v_requested then
    raise exception 'One or more selected clients are unavailable or archived';
  end if;

  for v_client in
    select c.* from clients c
    where c.id = any(p_client_ids)
      and c.firm_id = v_actor.firm_id
      and c.status <> 'archived'
    order by c.id
  loop
    if exists (
      select 1 from document_requests dr
      where dr.client_id = v_client.id
        and dr.firm_id = v_actor.firm_id
        and dr.status in ('open','received')
        and lower(btrim(dr.title)) = lower(btrim(p_title))
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into document_requests(
      firm_id,client_id,title,details,due_date,requested_by
    )
    values(
      v_actor.firm_id,v_client.id,btrim(p_title),
      nullif(btrim(coalesce(p_details,'')),''),
      p_due_date,v_actor.id
    )
    returning * into v_request;

    insert into notifications(
      subject_client_id,target_client_id,recipient_email,kind,event_key,created_at
    )
    values(
      v_client.id,v_client.id,v_client.email,'document_request',
      'document-request:' || v_request.id::text,v_request.created_at
    )
    on conflict(event_key) do nothing;

    insert into audit_log(
      firm_id,actor_id,action,target_type,target_id,metadata
    )
    values(
      v_actor.firm_id,v_actor.id,'document_request.created','client',v_client.id,
      jsonb_build_object(
        'document_request_id',v_request.id,
        'due_date',v_request.due_date,
        'batch',true
      )
    );

    v_created := v_created + 1;
  end loop;

  return query select v_created, v_skipped;
end;
$$;

revoke all on function public.create_document_requests_batch(uuid[],text,text,date)
from public, anon;

grant execute on function public.create_document_requests_batch(uuid[],text,text,date)
to authenticated;
