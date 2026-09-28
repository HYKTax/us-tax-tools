alter table public.firms
  add column if not exists support_email text,
  add column if not exists support_phone text,
  add column if not exists website_url text,
  add column if not exists portal_welcome_message text;

alter table public.firms drop constraint if exists firms_support_email_length_check;
alter table public.firms add constraint firms_support_email_length_check
  check (support_email is null or length(support_email) <= 320);

alter table public.firms drop constraint if exists firms_support_phone_length_check;
alter table public.firms add constraint firms_support_phone_length_check
  check (support_phone is null or length(support_phone) <= 80);

alter table public.firms drop constraint if exists firms_website_url_length_check;
alter table public.firms add constraint firms_website_url_length_check
  check (website_url is null or length(website_url) <= 500);

alter table public.firms drop constraint if exists firms_portal_welcome_message_length_check;
alter table public.firms add constraint firms_portal_welcome_message_length_check
  check (portal_welcome_message is null or length(portal_welcome_message) <= 1000);

create or replace function public.update_firm_settings(
  p_name text,
  p_support_email text,
  p_support_phone text,
  p_website_url text,
  p_portal_welcome_message text
)
returns public.firms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_firm firms;
  v_name text := nullif(btrim(p_name), '');
  v_email text := nullif(btrim(p_support_email), '');
  v_phone text := nullif(btrim(p_support_phone), '');
  v_website text := nullif(btrim(p_website_url), '');
  v_message text := nullif(btrim(p_portal_welcome_message), '');
begin
  select * into v_actor from profiles where id = auth.uid();

  if v_actor.id is null
     or not v_actor.is_active
     or not (
       v_actor.role = 'firm_admin'
       or (v_actor.role = 'firm_staff' and v_actor.staff_role = 'admin')
     ) then
    raise exception 'Only a Firm Admin can update firm settings';
  end if;

  if v_name is null or length(v_name) > 160 then
    raise exception 'Firm name must be between 1 and 160 characters';
  end if;

  if v_email is not null
     and (
       length(v_email) > 320
       or v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
     ) then
    raise exception 'Enter a valid support email';
  end if;

  if v_phone is not null and length(v_phone) > 80 then
    raise exception 'Support phone is too long';
  end if;

  if v_website is not null
     and (
       length(v_website) > 500
       or v_website !~* '^https://'
     ) then
    raise exception 'Website must use an https:// URL';
  end if;

  if v_message is not null and length(v_message) > 1000 then
    raise exception 'Portal welcome message is too long';
  end if;

  update firms
  set
    name = v_name,
    support_email = v_email,
    support_phone = v_phone,
    website_url = v_website,
    portal_welcome_message = v_message
  where id = v_actor.firm_id
  returning * into v_firm;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_actor.firm_id,
    v_actor.id,
    'firm.settings_updated',
    'firm',
    v_actor.firm_id,
    jsonb_build_object(
      'support_email_configured',v_email is not null,
      'support_phone_configured',v_phone is not null,
      'website_configured',v_website is not null,
      'welcome_message_configured',v_message is not null
    )
  );

  return v_firm;
end;
$$;

revoke all on function public.update_firm_settings(text,text,text,text,text)
from public,anon;

grant execute on function public.update_firm_settings(text,text,text,text,text)
to authenticated;
