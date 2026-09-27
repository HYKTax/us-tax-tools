create or replace function public.admin_update_staff_access(
  p_profile_id uuid,
  p_staff_role text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_target profiles;
  v_new_role profile_role;
  v_other_admins integer;
  v_can_prepare boolean;
  v_can_review boolean;
begin
  select * into v_actor from profiles where id=auth.uid();

  if v_actor.id is null or v_actor.role <> 'firm_admin' or not v_actor.is_active then
    raise exception 'Only an active firm administrator can manage staff';
  end if;

  if p_staff_role not in ('admin','manager','reviewer','preparer') then
    raise exception 'Invalid operational role';
  end if;

  v_new_role := case
    when p_staff_role='admin' then 'firm_admin'::profile_role
    else 'firm_staff'::profile_role
  end;
  v_can_prepare := p_staff_role in ('admin','manager','preparer');
  v_can_review := p_staff_role in ('admin','manager','reviewer');

  select * into v_target
  from profiles
  where id=p_profile_id
    and firm_id=v_actor.firm_id
    and role in ('firm_admin','firm_staff')
  for update;

  if v_target.id is null then
    raise exception 'Staff member not found';
  end if;

  if v_target.id=v_actor.id and (p_staff_role<>'admin' or not p_is_active) then
    raise exception 'You cannot remove your own administrator access';
  end if;

  if v_target.role='firm_admin' and v_target.is_active
     and (v_new_role<>'firm_admin' or not p_is_active) then
    select count(*) into v_other_admins
    from profiles
    where firm_id=v_actor.firm_id
      and role='firm_admin'
      and is_active
      and id<>v_target.id;

    if v_other_admins=0 then
      raise exception 'A firm must have at least one active administrator';
    end if;
  end if;

  if (not p_is_active or not v_can_prepare)
     and exists (
       select 1
       from tax_return_jobs j
       where j.preparer_id=v_target.id
         and j.firm_id=v_actor.firm_id
         and j.status not in ('accepted','completed')
     ) then
    raise exception 'Reassign this staff member''s open preparation work before changing or disabling their role';
  end if;

  if (not p_is_active or not v_can_review)
     and exists (
       select 1
       from tax_return_jobs j
       where j.reviewer_id=v_target.id
         and j.firm_id=v_actor.firm_id
         and j.status not in ('accepted','completed')
     ) then
    raise exception 'Reassign this staff member''s open review work before changing or disabling their role';
  end if;

  update profiles
  set role=v_new_role,
      staff_role=p_staff_role,
      is_active=p_is_active
  where id=v_target.id;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_actor.firm_id,v_actor.id,'staff.access_updated','profile',v_target.id,
    jsonb_build_object(
      'old_role',v_target.role,'new_role',v_new_role,
      'old_staff_role',v_target.staff_role,'new_staff_role',p_staff_role,
      'old_is_active',v_target.is_active,'new_is_active',p_is_active
    )
  );
end;
$$;

create or replace function public.admin_update_staff(
  p_profile_id uuid,
  p_role profile_role,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target profiles;
  v_staff_role text;
begin
  if p_role not in ('firm_admin','firm_staff') then
    raise exception 'Invalid staff role';
  end if;

  select * into v_target
  from profiles
  where id=p_profile_id
    and firm_id=private.current_firm_id()
    and role in ('firm_admin','firm_staff');

  if v_target.id is null then
    raise exception 'Staff member not found';
  end if;

  v_staff_role := case
    when p_role='firm_admin' then 'admin'
    when v_target.staff_role in ('manager','reviewer','preparer') then v_target.staff_role
    else 'preparer'
  end;

  perform public.admin_update_staff_access(p_profile_id,v_staff_role,p_is_active);
end;
$$;
