create or replace function public.assign_client_tag_batch(
  p_client_ids uuid[],
  p_name text
)
returns table(assigned_count integer, skipped_count integer, tag_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_tag client_tags;
  v_requested integer;
  v_valid integer;
  v_before integer;
  v_after integer;
  v_name text := btrim(p_name);
begin
  select * into v_actor
  from profiles
  where id = auth.uid()
    and is_active;

  if v_actor.id is null
     or not private.has_staff_permission('clients.manage') then
    raise exception 'Not authorized';
  end if;

  if p_client_ids is null or cardinality(p_client_ids) = 0 then
    raise exception 'Select at least one client';
  end if;

  if cardinality(p_client_ids) > 500 then
    raise exception 'Tag no more than 500 clients at a time';
  end if;

  if length(v_name) < 1 or length(v_name) > 40 then
    raise exception 'Tag must be between 1 and 40 characters';
  end if;

  select count(distinct id)
  into v_requested
  from unnest(p_client_ids) id;

  select count(*)
  into v_valid
  from clients c
  where c.id = any(p_client_ids)
    and c.firm_id = v_actor.firm_id;

  if v_valid <> v_requested then
    raise exception 'One or more selected clients are unavailable';
  end if;

  insert into client_tags(firm_id,name,created_by)
  values(v_actor.firm_id,v_name,v_actor.id)
  on conflict do nothing;

  select * into v_tag
  from client_tags t
  where t.firm_id = v_actor.firm_id
    and lower(btrim(t.name)) = lower(v_name)
  limit 1;

  select count(*)
  into v_before
  from client_tag_assignments a
  where a.tag_id = v_tag.id
    and a.client_id = any(p_client_ids);

  insert into client_tag_assignments(tag_id,client_id,firm_id,assigned_by)
  select v_tag.id,c.id,v_actor.firm_id,v_actor.id
  from clients c
  where c.id = any(p_client_ids)
    and c.firm_id = v_actor.firm_id
  on conflict(tag_id,client_id) do nothing;

  select count(*)
  into v_after
  from client_tag_assignments a
  where a.tag_id = v_tag.id
    and a.client_id = any(p_client_ids);

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_actor.firm_id,v_actor.id,'client.tag_batch_assigned','client_tag',v_tag.id,
    jsonb_build_object(
      'tag_name',v_tag.name,
      'client_count',v_after-v_before,
      'selected_count',v_requested
    )
  );

  return query
  select v_after-v_before, v_requested-(v_after-v_before), v_tag.id;
end;
$$;

revoke all on function public.assign_client_tag_batch(uuid[],text)
from public, anon;

grant execute on function public.assign_client_tag_batch(uuid[],text)
to authenticated;
