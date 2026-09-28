create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_count integer := 0;
  v_client_count integer := 0;
  v_inv staff_invitations;
  v_client clients;
begin
  if new.email is null or btrim(new.email) = '' then
    raise exception 'An authorized invitation is required';
  end if;

  select count(*) into v_staff_count
  from staff_invitations
  where lower(email) = lower(new.email)
    and status = 'invited'
    and (auth_user_id is null or auth_user_id = new.id);

  select count(*) into v_client_count
  from clients
  where lower(email) = lower(new.email)
    and profile_id is null
    and status <> 'archived';

  if v_staff_count + v_client_count = 0 then
    raise exception 'An authorized invitation is required';
  end if;

  if v_staff_count + v_client_count > 1 then
    raise exception 'Multiple invitation records match this email. Ask a firm administrator to resolve the duplicate access records';
  end if;

  if v_staff_count = 1 then
    select * into v_inv
    from staff_invitations
    where lower(email) = lower(new.email)
      and status = 'invited'
      and (auth_user_id is null or auth_user_id = new.id)
    for update;

    insert into profiles (
      id,
      firm_id,
      role,
      full_name,
      email,
      is_active,
      staff_role
    )
    values (
      new.id,
      v_inv.firm_id,
      v_inv.role,
      v_inv.full_name,
      new.email,
      true,
      v_inv.staff_role
    );

    update staff_invitations
    set auth_user_id = new.id,
        revoked_at = null
    where id = v_inv.id;
  else
    select * into v_client
    from clients
    where lower(email) = lower(new.email)
      and profile_id is null
      and status <> 'archived'
    for update;

    insert into profiles (
      id,
      firm_id,
      role,
      full_name,
      email,
      is_active,
      staff_role
    )
    values (
      new.id,
      v_client.firm_id,
      'client',
      v_client.primary_contact_name,
      new.email,
      true,
      null
    );

    update clients
    set profile_id = new.id,
        status = 'active'
    where id = v_client.id;
  end if;

  return new;
end;
$$;
