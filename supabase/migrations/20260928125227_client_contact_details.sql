alter table public.clients
  add column if not exists phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state_region text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists preferred_contact_method text not null default 'portal',
  add column if not exists contact_updated_at timestamptz;

alter table public.clients
  drop constraint if exists clients_phone_length,
  add constraint clients_phone_length check (phone is null or length(phone) <= 40),
  drop constraint if exists clients_address_line1_length,
  add constraint clients_address_line1_length check (address_line1 is null or length(address_line1) <= 200),
  drop constraint if exists clients_address_line2_length,
  add constraint clients_address_line2_length check (address_line2 is null or length(address_line2) <= 200),
  drop constraint if exists clients_city_length,
  add constraint clients_city_length check (city is null or length(city) <= 100),
  drop constraint if exists clients_state_region_length,
  add constraint clients_state_region_length check (state_region is null or length(state_region) <= 100),
  drop constraint if exists clients_postal_code_length,
  add constraint clients_postal_code_length check (postal_code is null or length(postal_code) <= 30),
  drop constraint if exists clients_country_length,
  add constraint clients_country_length check (country is null or length(country) <= 100),
  drop constraint if exists clients_preferred_contact_method_check,
  add constraint clients_preferred_contact_method_check
    check (preferred_contact_method in ('portal','email','phone'));

create or replace function public.update_client_contact_details(
  p_client_id uuid,
  p_phone text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city text default null,
  p_state_region text default null,
  p_postal_code text default null,
  p_country text default null,
  p_preferred_contact_method text default 'portal'
)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_client clients;
begin
  select * into v_actor
  from profiles
  where id = auth.uid()
    and is_active;

  if v_actor.id is null then
    raise exception 'Not authorized';
  end if;

  select * into v_client
  from clients
  where id = p_client_id
  for update;

  if v_client.id is null then
    raise exception 'Client not found';
  end if;

  if v_actor.role = 'client' then
    if v_client.profile_id is distinct from v_actor.id then
      raise exception 'Not authorized';
    end if;
  elsif v_actor.role in ('firm_admin','firm_staff') then
    if v_client.firm_id is distinct from v_actor.firm_id
       or not private.has_staff_permission('clients.manage') then
      raise exception 'Not authorized';
    end if;
  else
    raise exception 'Not authorized';
  end if;

  if p_preferred_contact_method not in ('portal','email','phone') then
    raise exception 'Choose a valid contact preference';
  end if;

  if p_phone is not null and length(btrim(p_phone)) > 40 then
    raise exception 'Phone number is too long';
  end if;
  if p_address_line1 is not null and length(btrim(p_address_line1)) > 200 then
    raise exception 'Address line 1 is too long';
  end if;
  if p_address_line2 is not null and length(btrim(p_address_line2)) > 200 then
    raise exception 'Address line 2 is too long';
  end if;
  if p_city is not null and length(btrim(p_city)) > 100 then
    raise exception 'City is too long';
  end if;
  if p_state_region is not null and length(btrim(p_state_region)) > 100 then
    raise exception 'State or region is too long';
  end if;
  if p_postal_code is not null and length(btrim(p_postal_code)) > 30 then
    raise exception 'Postal code is too long';
  end if;
  if p_country is not null and length(btrim(p_country)) > 100 then
    raise exception 'Country is too long';
  end if;

  update clients
  set
    phone = nullif(btrim(coalesce(p_phone,'')),''),
    address_line1 = nullif(btrim(coalesce(p_address_line1,'')),''),
    address_line2 = nullif(btrim(coalesce(p_address_line2,'')),''),
    city = nullif(btrim(coalesce(p_city,'')),''),
    state_region = nullif(btrim(coalesce(p_state_region,'')),''),
    postal_code = nullif(btrim(coalesce(p_postal_code,'')),''),
    country = nullif(btrim(coalesce(p_country,'')),''),
    preferred_contact_method = p_preferred_contact_method,
    contact_updated_at = now()
  where id = v_client.id
  returning * into v_client;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_client.firm_id,v_actor.id,'client.contact_updated','client',v_client.id,
    jsonb_build_object(
      'updated_by_role',v_actor.role,
      'preferred_contact_method',v_client.preferred_contact_method
    )
  );

  return v_client;
end;
$$;

revoke all on function public.update_client_contact_details(
  uuid,text,text,text,text,text,text,text,text
) from public, anon;

grant execute on function public.update_client_contact_details(
  uuid,text,text,text,text,text,text,text,text
) to authenticated;
