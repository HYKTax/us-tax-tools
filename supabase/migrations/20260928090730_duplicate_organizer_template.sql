create or replace function public.duplicate_organizer_template(
  p_template_id uuid,
  p_tax_year integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor profiles;
  v_source organizer_templates;
  v_new_id uuid;
begin
  select * into v_actor
  from profiles
  where id = auth.uid();

  if v_actor.id is null
     or not v_actor.is_active
     or not private.has_staff_permission('templates.manage') then
    raise exception 'Not authorized';
  end if;

  if p_tax_year < 2000 or p_tax_year > 2100 then
    raise exception 'Tax year is out of range';
  end if;

  select * into v_source
  from organizer_templates
  where id = p_template_id
    and firm_id = v_actor.firm_id;

  if v_source.id is null then
    raise exception 'Template not found';
  end if;

  insert into organizer_templates(firm_id,name,tax_year,created_by)
  values(v_source.firm_id,v_source.name,p_tax_year,auth.uid())
  returning id into v_new_id;

  insert into organizer_template_items(
    template_id,sort_order,section_title,prompt,help_text,response_type,options,is_required
  )
  select
    v_new_id,sort_order,section_title,prompt,help_text,response_type,options,is_required
  from organizer_template_items
  where template_id = v_source.id
  order by sort_order,id;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_source.firm_id,
    auth.uid(),
    'organizer_template.duplicated',
    'organizer_template',
    v_new_id,
    jsonb_build_object(
      'source_template_id',v_source.id,
      'source_tax_year',v_source.tax_year,
      'target_tax_year',p_tax_year
    )
  );

  return v_new_id;
end;
$$;

revoke all on function public.duplicate_organizer_template(uuid,integer)
from public, anon;

grant execute on function public.duplicate_organizer_template(uuid,integer)
to authenticated;
