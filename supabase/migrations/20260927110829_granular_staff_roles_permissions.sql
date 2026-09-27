alter table public.profiles
  add column if not exists staff_role text;

update public.profiles
set staff_role = case
  when role = 'firm_admin' then 'admin'
  when role = 'firm_staff' then coalesce(staff_role, 'preparer')
  else null
end
where staff_role is null
   or role = 'firm_admin'
   or role = 'client';

alter table public.profiles
  drop constraint if exists profiles_staff_role_check;

alter table public.profiles
  add constraint profiles_staff_role_check check (
    (role = 'client' and staff_role is null)
    or (role = 'firm_admin' and staff_role = 'admin')
    or (role = 'firm_staff' and staff_role in ('manager','reviewer','preparer'))
  );

alter table public.staff_invitations
  add column if not exists staff_role text;

update public.staff_invitations
set staff_role = case
  when role = 'firm_admin' then 'admin'
  else coalesce(staff_role, 'preparer')
end
where staff_role is null or role = 'firm_admin';

alter table public.staff_invitations
  alter column staff_role set not null;

alter table public.staff_invitations
  drop constraint if exists staff_invitations_staff_role_check;

alter table public.staff_invitations
  add constraint staff_invitations_staff_role_check check (
    (role = 'firm_admin' and staff_role = 'admin')
    or (role = 'firm_staff' and staff_role in ('manager','reviewer','preparer'))
  );

create or replace function private.has_staff_permission(p_permission text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.is_active
      and (
        p.role = 'firm_admin'
        or (
          p.role = 'firm_staff'
          and (
            (p.staff_role = 'manager' and p_permission in (
              'clients.manage',
              'organizers.manage',
              'organizers.review',
              'documents.manage',
              'ai.run',
              'documents.review',
              'returns.manage',
              'returns.review',
              'templates.manage'
            ))
            or (p.staff_role = 'reviewer' and p_permission in (
              'organizers.review',
              'ai.run',
              'documents.review',
              'returns.manage',
              'returns.review'
            ))
            or (p.staff_role = 'preparer' and p_permission in (
              'clients.manage',
              'organizers.manage',
              'documents.manage',
              'ai.run',
              'returns.manage'
            ))
          )
        )
      )
  );
$$;

create or replace function private.can_be_preparer(p_profile_id uuid, p_firm_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = p_profile_id
      and p.firm_id = p_firm_id
      and p.is_active
      and (
        p.role = 'firm_admin'
        or (p.role = 'firm_staff' and p.staff_role in ('manager','preparer'))
      )
  );
$$;

create or replace function private.can_be_reviewer(p_profile_id uuid, p_firm_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = p_profile_id
      and p.firm_id = p_firm_id
      and p.is_active
      and (
        p.role = 'firm_admin'
        or (p.role = 'firm_staff' and p.staff_role in ('manager','reviewer'))
      )
  );
$$;

drop policy if exists "clients_insert_staff" on public.clients;
create policy "clients_insert_staff" on public.clients
for insert to authenticated
with check (
  private.has_staff_permission('clients.manage')
  and firm_id = private.current_firm_id()
);

drop policy if exists "clients_update_staff" on public.clients;
create policy "clients_update_staff" on public.clients
for update to authenticated
using (
  private.has_staff_permission('clients.manage')
  and firm_id = private.current_firm_id()
)
with check (
  private.has_staff_permission('clients.manage')
  and firm_id = private.current_firm_id()
);

drop policy if exists "templates_manage_admin" on public.organizer_templates;
create policy "templates_manage_staff" on public.organizer_templates
for all to authenticated
using (
  private.has_staff_permission('templates.manage')
  and firm_id = private.current_firm_id()
)
with check (
  private.has_staff_permission('templates.manage')
  and firm_id = private.current_firm_id()
);

drop policy if exists "template_items_manage_admin" on public.organizer_template_items;
create policy "template_items_manage_staff" on public.organizer_template_items
for all to authenticated
using (
  private.has_staff_permission('templates.manage')
  and exists (
    select 1 from organizer_templates t
    where t.id = organizer_template_items.template_id
      and t.firm_id = private.current_firm_id()
  )
)
with check (
  private.has_staff_permission('templates.manage')
  and exists (
    select 1 from organizer_templates t
    where t.id = organizer_template_items.template_id
      and t.firm_id = private.current_firm_id()
  )
);

drop policy if exists "organizers_write_staff" on public.organizers;
create policy "organizers_write_staff" on public.organizers
for all to authenticated
using (
  private.has_staff_permission('organizers.manage')
  and firm_id = private.current_firm_id()
)
with check (
  private.has_staff_permission('organizers.manage')
  and firm_id = private.current_firm_id()
);

drop policy if exists "organizer_items_write_staff" on public.organizer_items;
create policy "organizer_items_write_staff" on public.organizer_items
for all to authenticated
using (
  private.has_staff_permission('organizers.manage')
  and exists (
    select 1 from organizers o
    where o.id = organizer_items.organizer_id
      and o.firm_id = private.current_firm_id()
  )
)
with check (
  private.has_staff_permission('organizers.manage')
  and exists (
    select 1 from organizers o
    where o.id = organizer_items.organizer_id
      and o.firm_id = private.current_firm_id()
  )
);

drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    (
      private.has_staff_permission('documents.manage')
      and firm_id = private.current_firm_id()
    )
    or client_id = private.current_client_id()
  )
);

drop policy if exists "documents_update_staff" on public.documents;
create policy "documents_update_staff" on public.documents
for update to authenticated
using (
  private.has_staff_permission('documents.manage')
  and firm_id = private.current_firm_id()
)
with check (
  private.has_staff_permission('documents.manage')
  and firm_id = private.current_firm_id()
);

drop policy if exists "storage_insert" on storage.objects;
create policy "storage_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'client-documents'
  and exists (
    select 1
    from public.clients c
    where c.id::text = (storage.foldername(name))[2]
      and c.firm_id::text = (storage.foldername(name))[1]
      and c.firm_id = private.current_firm_id()
      and (
        private.has_staff_permission('documents.manage')
        or c.id = private.current_client_id()
      )
  )
);

drop policy if exists "extractions_update_staff" on public.document_extractions;
create policy "extractions_update_staff" on public.document_extractions
for update to authenticated
using (
  private.has_staff_permission('documents.review')
  and exists (
    select 1 from documents d
    where d.id = document_extractions.document_id
      and d.firm_id = private.current_firm_id()
  )
)
with check (
  private.has_staff_permission('documents.review')
  and (reviewed_by is null or reviewed_by = auth.uid())
);

drop policy if exists "tax_return_jobs_staff_insert" on public.tax_return_jobs;
create policy "tax_return_jobs_staff_insert" on public.tax_return_jobs
for insert to authenticated
with check (
  private.has_staff_permission('returns.manage')
  and firm_id = private.current_firm_id()
  and created_by = auth.uid()
);

drop policy if exists "tax_return_jobs_staff_update" on public.tax_return_jobs;
create policy "tax_return_jobs_staff_update" on public.tax_return_jobs
for update to authenticated
using (
  private.has_staff_permission('returns.manage')
  and firm_id = private.current_firm_id()
)
with check (
  private.has_staff_permission('returns.manage')
  and firm_id = private.current_firm_id()
);

create or replace function private.validate_tax_return_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from clients c where c.id = new.client_id and c.firm_id = new.firm_id
  ) then raise exception 'Client must belong to the same firm'; end if;

  if new.organizer_id is not null and not exists (
    select 1 from organizers o
    where o.id = new.organizer_id and o.firm_id = new.firm_id and o.client_id = new.client_id
  ) then raise exception 'Organizer must belong to this client and firm'; end if;

  if new.created_by is null or not exists (
    select 1 from profiles p
    where p.id = new.created_by and p.firm_id = new.firm_id
      and p.role in ('firm_admin','firm_staff') and p.is_active
  ) then raise exception 'Creator must be active staff in the same firm'; end if;

  if new.preparer_id is not null
     and not private.can_be_preparer(new.preparer_id, new.firm_id) then
    raise exception 'Preparer must be an active Admin, Manager, or Preparer in the same firm';
  end if;

  if new.reviewer_id is not null
     and not private.can_be_reviewer(new.reviewer_id, new.firm_id) then
    raise exception 'Reviewer must be an active Admin, Manager, or Reviewer in the same firm';
  end if;

  if new.extension_status = 'filed' and new.extension_filed_at is null then
    new.extension_filed_at := now();
  elsif new.extension_status <> 'filed' then
    new.extension_filed_at := null;
  end if;

  if new.efile_status in ('transmitted','accepted','rejected') and new.efile_transmitted_at is null then
    new.efile_transmitted_at := now();
  end if;

  if new.efile_status = 'accepted' and new.efile_accepted_at is null then
    new.efile_accepted_at := now();
  elsif new.efile_status <> 'accepted' then
    new.efile_accepted_at := null;
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.review_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc documents;
begin
  if auth.uid() is null or not private.has_staff_permission('documents.review') then
    raise exception 'Not authorized';
  end if;

  select * into v_doc
  from documents
  where id = p_document_id
    and firm_id = private.current_firm_id()
  for update;

  if v_doc.id is null then raise exception 'Document not found'; end if;

  update documents
  set status = 'reviewed'
  where id = v_doc.id;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id)
  values(v_doc.firm_id,auth.uid(),'document.reviewed','document',v_doc.id);
end;
$$;

create or replace function public.review_organizer(p_organizer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o organizers;
begin
  if auth.uid() is null or not private.has_staff_permission('organizers.review') then
    raise exception 'Not authorized';
  end if;

  select * into v_o
  from organizers
  where id = p_organizer_id
    and firm_id = private.current_firm_id()
  for update;

  if v_o.id is null then raise exception 'Organizer not found'; end if;
  if v_o.status <> 'submitted' then raise exception 'This organizer is not awaiting review'; end if;

  update organizers
  set status = 'reviewed'
  where id = v_o.id;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id)
  values(v_o.firm_id,auth.uid(),'organizer.reviewed','organizer',v_o.id);
end;
$$;

create or replace function public.request_organizer_changes(p_organizer_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_o organizers;
begin
  if auth.uid() is null or not private.has_staff_permission('organizers.review') then
    raise exception 'Not authorized';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 5000 then
    raise exception 'Enter a reason (up to 5000 characters)';
  end if;
  select * into v_o
  from organizers
  where id=p_organizer_id and firm_id=private.current_firm_id()
  for update;
  if v_o.id is null then raise exception 'Organizer not found'; end if;
  if v_o.status not in ('submitted','reviewed') then raise exception 'Organizer is not awaiting review'; end if;
  update organizers set status='sent',submitted_at=null,change_request_reason=btrim(p_reason) where id=v_o.id;
  insert into audit_log(firm_id,actor_id,action,target_type,target_id)
  values(v_o.firm_id,auth.uid(),'organizer.changes_requested','organizer',v_o.id);
end;
$$;

create or replace function public.prepare_client_invitation(p_client_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_client clients; v_user auth.users; v_profile profiles;
begin
  if auth.uid() is null or not private.has_staff_permission('clients.manage') then
    raise exception 'Not authorized';
  end if;
  select * into v_client from clients
  where id=p_client_id and firm_id=private.current_firm_id() for update;
  if v_client.id is null then raise exception 'Client not found'; end if;
  if v_client.status='archived' then raise exception 'Restore this client before inviting them'; end if;
  select * into v_user from auth.users where lower(email)=lower(v_client.email) for update;
  if v_user.id is null then return 'invite'; end if;
  select * into v_profile from profiles where id=v_user.id for update;
  if v_profile.id is not null and
    (v_profile.firm_id <> v_client.firm_id or v_profile.role <> 'client') then
    raise exception 'This email belongs to an account with different access. Use a separate client email or contact your administrator';
  end if;
  if v_client.profile_id is not null and v_client.profile_id <> v_user.id then
    raise exception 'This client is already linked to a different account';
  end if;
  if exists(select 1 from clients where profile_id=v_user.id and id<>v_client.id) then
    raise exception 'This account is already linked to another client';
  end if;
  if v_profile.id is null then
    insert into profiles(id,firm_id,role,full_name,email,staff_role)
    values(v_user.id,v_client.firm_id,'client',v_client.primary_contact_name,v_user.email,null);
  end if;
  if v_client.profile_id is null then
    update clients set profile_id=v_user.id,status='active' where id=v_client.id;
    insert into audit_log(firm_id,actor_id,action,target_type,target_id)
    values(v_client.firm_id,auth.uid(),'client.account_linked','client',v_client.id);
  end if;
  return 'signin';
end;
$$;

create or replace function public.accept_document_extraction(p_document_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc documents;
  v_extraction document_extractions;
  v_field jsonb;
  v_count integer := 0;
begin
  if auth.uid() is null or not private.has_staff_permission('returns.review') then
    raise exception 'Not authorized';
  end if;

  select * into v_doc
  from documents
  where id = p_document_id
    and firm_id = private.current_firm_id()
  for update;

  if v_doc.id is null then raise exception 'Document not found'; end if;
  if v_doc.tax_return_job_id is null then raise exception 'Link this document to a tax return first'; end if;
  if v_doc.status <> 'reviewed' then raise exception 'Review the source document before accepting AI data'; end if;

  select * into v_extraction
  from document_extractions
  where document_id = v_doc.id
  for update;

  if v_extraction.id is null
     or v_extraction.status <> 'completed'
     or v_extraction.reviewed_at is null
     or v_extraction.reviewed_by is null then
    raise exception 'Review the completed AI extraction before accepting it';
  end if;

  if jsonb_typeof(v_extraction.fields) <> 'array' then
    raise exception 'Extraction has no structured fields';
  end if;

  delete from tax_return_source_values
  where tax_return_job_id = v_doc.tax_return_job_id
    and document_id = v_doc.id;

  for v_field in select value from jsonb_array_elements(v_extraction.fields)
  loop
    if coalesce(btrim(v_field->>'name'), '') <> ''
       and coalesce(btrim(v_field->>'label'), '') <> ''
       and coalesce(btrim(v_field->>'value'), '') <> '' then
      insert into tax_return_source_values (
        firm_id,tax_return_job_id,document_id,extraction_id,field_name,field_label,
        value,confidence,accepted_by,accepted_at
      )
      values (
        v_doc.firm_id,v_doc.tax_return_job_id,v_doc.id,v_extraction.id,
        btrim(v_field->>'name'),btrim(v_field->>'label'),btrim(v_field->>'value'),
        case
          when (v_field->>'confidence') ~ '^[0-9]+([.][0-9]+)?$'
          then least(1, greatest(0, (v_field->>'confidence')::numeric))
          else null
        end,
        auth.uid(),now()
      );
      v_count := v_count + 1;
    end if;
  end loop;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values (
    v_doc.firm_id,auth.uid(),'document.ai_data_accepted','document',v_doc.id,
    jsonb_build_object(
      'tax_return_job_id', v_doc.tax_return_job_id,
      'extraction_id', v_extraction.id,
      'field_count', v_count
    )
  );

  return v_count;
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
  v_actor profiles;
  v_target profiles;
  v_other_admins integer;
  v_staff_role text;
begin
  select * into v_actor from profiles where id = auth.uid();

  if v_actor.id is null or v_actor.role <> 'firm_admin' or not v_actor.is_active then
    raise exception 'Only an active firm administrator can manage staff';
  end if;

  if p_role not in ('firm_admin','firm_staff') then raise exception 'Invalid staff role'; end if;

  select * into v_target
  from profiles
  where id = p_profile_id
    and firm_id = v_actor.firm_id
    and role in ('firm_admin','firm_staff')
  for update;

  if v_target.id is null then raise exception 'Staff member not found'; end if;

  v_staff_role := case
    when p_role = 'firm_admin' then 'admin'
    when v_target.staff_role in ('manager','reviewer','preparer') then v_target.staff_role
    else 'preparer'
  end;

  if v_target.id = v_actor.id and (p_role <> 'firm_admin' or not p_is_active) then
    raise exception 'You cannot remove your own administrator access';
  end if;

  if v_target.role = 'firm_admin' and v_target.is_active
     and (p_role <> 'firm_admin' or not p_is_active) then
    select count(*) into v_other_admins
    from profiles
    where firm_id = v_actor.firm_id and role='firm_admin' and is_active and id<>v_target.id;
    if v_other_admins=0 then raise exception 'A firm must have at least one active administrator'; end if;
  end if;

  update profiles
  set role=p_role, staff_role=v_staff_role, is_active=p_is_active
  where id=v_target.id;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_actor.firm_id,v_actor.id,'staff.updated','profile',v_target.id,
    jsonb_build_object(
      'old_role',v_target.role,'new_role',p_role,
      'old_staff_role',v_target.staff_role,'new_staff_role',v_staff_role,
      'old_is_active',v_target.is_active,'new_is_active',p_is_active
    )
  );
end;
$$;

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
begin
  select * into v_actor from profiles where id=auth.uid();

  if v_actor.id is null or v_actor.role <> 'firm_admin' or not v_actor.is_active then
    raise exception 'Only an active firm administrator can manage staff';
  end if;

  if p_staff_role not in ('admin','manager','reviewer','preparer') then
    raise exception 'Invalid operational role';
  end if;

  v_new_role := case when p_staff_role='admin' then 'firm_admin'::profile_role else 'firm_staff'::profile_role end;

  select * into v_target
  from profiles
  where id=p_profile_id
    and firm_id=v_actor.firm_id
    and role in ('firm_admin','firm_staff')
  for update;

  if v_target.id is null then raise exception 'Staff member not found'; end if;

  if v_target.id=v_actor.id and (p_staff_role<>'admin' or not p_is_active) then
    raise exception 'You cannot remove your own administrator access';
  end if;

  if v_target.role='firm_admin' and v_target.is_active
     and (v_new_role<>'firm_admin' or not p_is_active) then
    select count(*) into v_other_admins
    from profiles
    where firm_id=v_actor.firm_id and role='firm_admin' and is_active and id<>v_target.id;
    if v_other_admins=0 then raise exception 'A firm must have at least one active administrator'; end if;
  end if;

  update profiles
  set role=v_new_role, staff_role=p_staff_role, is_active=p_is_active
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_firm_id uuid;
  v_role profile_role;
  v_staff_role text;
  v_invitation_id uuid;
  v_inv staff_invitations;
begin
  v_metadata := case when new.invited_at is not null then new.raw_user_meta_data else new.raw_app_meta_data end;
  v_firm_id := nullif(v_metadata->>'firm_id','')::uuid;
  v_role := nullif(v_metadata->>'role','')::profile_role;
  v_staff_role := nullif(v_metadata->>'staff_role','');
  v_invitation_id := nullif(v_metadata->>'staff_invitation_id','')::uuid;

  if v_firm_id is null or v_role is null then
    raise exception 'An authorized invitation is required';
  end if;

  if v_role in ('firm_admin','firm_staff') then
    if new.invited_at is null or v_invitation_id is null then
      raise exception 'Staff account requires a valid invitation';
    end if;

    select * into v_inv
    from staff_invitations
    where id=v_invitation_id
      and firm_id=v_firm_id
      and lower(email)=lower(new.email)
      and role=v_role
      and staff_role=v_staff_role
      and status='invited'
    for update;

    if v_inv.id is null then raise exception 'Staff invitation is invalid or expired'; end if;
  else
    v_staff_role := null;
    if new.invited_at is null then
      raise exception 'An authorized invitation is required';
    end if;
  end if;

  insert into profiles(id,firm_id,role,full_name,email,is_active,staff_role)
  values(
    new.id,v_firm_id,v_role,
    coalesce(new.raw_user_meta_data->>'full_name',new.email),
    new.email,true,v_staff_role
  );

  if v_role='client' then
    update clients set profile_id=new.id,status='active'
    where firm_id=v_firm_id and lower(email)=lower(new.email) and profile_id is null;
    if not found then raise exception 'No matching client invitation'; end if;
  else
    update staff_invitations
    set auth_user_id=new.id,revoked_at=null
    where id=v_inv.id;
  end if;

  return new;
end;
$$;

revoke all on function private.has_staff_permission(text), private.can_be_preparer(uuid,uuid), private.can_be_reviewer(uuid,uuid)
from public, anon;
grant execute on function private.has_staff_permission(text), private.can_be_preparer(uuid,uuid), private.can_be_reviewer(uuid,uuid)
to authenticated;

revoke all on function public.review_document(uuid), public.review_organizer(uuid), public.admin_update_staff_access(uuid,text,boolean)
from public, anon;
grant execute on function public.review_document(uuid), public.review_organizer(uuid), public.admin_update_staff_access(uuid,text,boolean)
to authenticated;
