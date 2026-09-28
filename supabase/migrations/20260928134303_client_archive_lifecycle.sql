create or replace function public.set_client_archived(
  p_client_id uuid,
  p_archived boolean
)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_client clients;
  v_profile profiles;
begin
  select * into v_actor
  from profiles
  where id = auth.uid()
    and is_active;

  if v_actor.id is null
     or not private.has_staff_permission('clients.manage') then
    raise exception 'Not authorized';
  end if;

  select * into v_client
  from clients
  where id = p_client_id
    and firm_id = v_actor.firm_id
  for update;

  if v_client.id is null then
    raise exception 'Client not found';
  end if;

  if p_archived then
    update clients
    set status = 'archived'
    where id = v_client.id
    returning * into v_client;

    if v_client.profile_id is not null then
      update profiles
      set is_active = false
      where id = v_client.profile_id
        and firm_id = v_actor.firm_id
        and role = 'client';
    end if;

    insert into audit_log(
      firm_id,actor_id,action,target_type,target_id,metadata
    )
    values(
      v_actor.firm_id,v_actor.id,'client.archived','client',v_client.id,
      jsonb_build_object('profile_id',v_client.profile_id)
    );
  else
    if v_client.profile_id is not null then
      select * into v_profile
      from profiles
      where id = v_client.profile_id
        and firm_id = v_actor.firm_id
        and role = 'client';

      if v_profile.id is null then
        raise exception 'Linked client profile is invalid';
      end if;

      update profiles set is_active = true where id = v_profile.id;

      update clients
      set status = 'active'
      where id = v_client.id
      returning * into v_client;
    else
      update clients
      set status = 'invited'
      where id = v_client.id
      returning * into v_client;
    end if;

    insert into audit_log(
      firm_id,actor_id,action,target_type,target_id,metadata
    )
    values(
      v_actor.firm_id,v_actor.id,'client.reactivated','client',v_client.id,
      jsonb_build_object('profile_id',v_client.profile_id,'status',v_client.status)
    );
  end if;

  return v_client;
end;
$$;

revoke all on function public.set_client_archived(uuid,boolean)
from public, anon;

grant execute on function public.set_client_archived(uuid,boolean)
to authenticated;
