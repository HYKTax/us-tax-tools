create or replace function public.send_organizer(
  p_client_id uuid,
  p_template_id uuid,
  p_tax_year int,
  p_title text
)
returns organizers
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organizer organizers;
  v_firm_id uuid := private.current_firm_id();
begin
  if not private.has_staff_permission('organizers.manage') then
    raise exception 'Not authorized to send organizers';
  end if;

  if p_tax_year < 2000 or p_tax_year > 2100 then
    raise exception 'Tax year is out of range';
  end if;

  if coalesce(length(btrim(p_title)),0) = 0 or length(btrim(p_title)) > 240 then
    raise exception 'Organizer title must be between 1 and 240 characters';
  end if;

  if not exists (
    select 1 from clients
    where id=p_client_id and firm_id=v_firm_id and status<>'archived'
  ) then
    raise exception 'Client not found in your firm';
  end if;

  if not exists (
    select 1 from organizer_templates
    where id=p_template_id and firm_id=v_firm_id
  ) then
    raise exception 'Template not found in your firm';
  end if;

  insert into organizers(
    firm_id,client_id,template_id,tax_year,title,status,created_by,sent_at
  )
  values(
    v_firm_id,p_client_id,p_template_id,p_tax_year,btrim(p_title),'sent',auth.uid(),now()
  )
  returning * into v_organizer;

  insert into organizer_items(
    organizer_id,sort_order,section_title,prompt,help_text,response_type,options,is_required
  )
  select
    v_organizer.id,sort_order,section_title,prompt,help_text,response_type,options,is_required
  from organizer_template_items
  where template_id=p_template_id
  order by sort_order,id;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_organizer.firm_id,auth.uid(),'organizer.sent','organizer',v_organizer.id,
    jsonb_build_object('client_id',p_client_id,'template_id',p_template_id)
  );

  return v_organizer;
end;
$$;

create or replace function public.send_organizers_batch(
  p_client_ids uuid[],
  p_template_id uuid,
  p_tax_year int,
  p_title text
)
returns table(created_count integer, skipped_count integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_firm_id uuid := private.current_firm_id();
  v_client_id uuid;
  v_created integer := 0;
  v_skipped integer := 0;
  v_ids uuid[];
begin
  if not private.has_staff_permission('organizers.manage') then
    raise exception 'Not authorized to send organizers';
  end if;

  if p_tax_year < 2000 or p_tax_year > 2100 then
    raise exception 'Tax year is out of range';
  end if;

  if coalesce(length(btrim(p_title)),0)=0 or length(btrim(p_title))>240 then
    raise exception 'Organizer title must be between 1 and 240 characters';
  end if;

  select coalesce(array_agg(distinct id),'{}'::uuid[])
  into v_ids
  from unnest(coalesce(p_client_ids,'{}'::uuid[])) as id
  where id is not null;

  if cardinality(v_ids)=0 then
    raise exception 'Select at least one client';
  end if;

  if cardinality(v_ids)>200 then
    raise exception 'Send no more than 200 organizers at a time';
  end if;

  if not exists (
    select 1 from organizer_templates
    where id=p_template_id and firm_id=v_firm_id
  ) then
    raise exception 'Template not found in your firm';
  end if;

  if (
    select count(*)
    from clients c
    where c.id=any(v_ids)
      and c.firm_id=v_firm_id
      and c.status<>'archived'
  ) <> cardinality(v_ids) then
    raise exception 'One or more selected clients are unavailable';
  end if;

  foreach v_client_id in array v_ids loop
    if exists (
      select 1 from organizers o
      where o.client_id=v_client_id
        and o.template_id=p_template_id
        and o.tax_year=p_tax_year
    ) then
      v_skipped := v_skipped+1;
    else
      perform public.send_organizer(v_client_id,p_template_id,p_tax_year,p_title);
      v_created := v_created+1;
    end if;
  end loop;

  return query select v_created,v_skipped;
end;
$$;

revoke all on function public.send_organizer(uuid,uuid,int,text),
  public.send_organizers_batch(uuid[],uuid,int,text)
from public,anon;

grant execute on function public.send_organizer(uuid,uuid,int,text),
  public.send_organizers_batch(uuid[],uuid,int,text)
to authenticated;
