-- Deep security hardening: authenticated-only application access and simplified RLS.

revoke all on table
  public.firms,
  public.profiles,
  public.clients,
  public.organizer_templates,
  public.organizer_template_items,
  public.organizers,
  public.organizer_items,
  public.organizer_responses,
  public.organizer_messages,
  public.documents,
  public.audit_log,
  public.document_extractions,
  public.organizer_item_suggestions,
  public.notifications,
  public.staff_invitations,
  public.tax_return_jobs,
  public.tax_return_source_values,
  public.otp_request_log
from anon;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema private from anon;

drop policy if exists "audit_log_select_staff" on public.audit_log;
create policy "audit_log_select_staff"
on public.audit_log for select to authenticated
using (
  private.is_firm_staff()
  and firm_id = private.current_firm_id()
);

drop policy if exists "audit_log_insert_staff" on public.audit_log;
create policy "audit_log_insert_staff"
on public.audit_log for insert to authenticated
with check (
  private.is_firm_staff()
  and firm_id = private.current_firm_id()
  and actor_id = (select auth.uid())
);

drop policy if exists "firms_select_own" on public.firms;
create policy "firms_select_own"
on public.firms for select to authenticated
using (id = private.current_firm_id());

drop policy if exists "clients_select_self" on public.clients;
drop policy if exists "clients_select_staff" on public.clients;
create policy "clients_select_authorized"
on public.clients for select to authenticated
using (
  profile_id = (select auth.uid())
  or (
    private.is_firm_staff()
    and firm_id = private.current_firm_id()
  )
);

drop policy if exists "documents_select_client" on public.documents;
drop policy if exists "documents_select_staff" on public.documents;
create policy "documents_select_authorized"
on public.documents for select to authenticated
using (
  client_id = private.current_client_id()
  or (
    private.is_firm_staff()
    and firm_id = private.current_firm_id()
  )
);

drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert"
on public.documents for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (
    (
      private.has_staff_permission('documents.manage')
      and firm_id = private.current_firm_id()
    )
    or client_id = private.current_client_id()
  )
);

drop policy if exists "extractions_select_staff" on public.document_extractions;
create policy "extractions_select_staff"
on public.document_extractions for select to authenticated
using (
  exists (
    select 1
    from public.documents d
    where d.id = document_extractions.document_id
      and private.is_firm_staff()
      and d.firm_id = private.current_firm_id()
  )
);

drop policy if exists "extractions_update_staff" on public.document_extractions;
create policy "extractions_update_staff"
on public.document_extractions for update to authenticated
using (
  private.has_staff_permission('documents.review')
  and exists (
    select 1 from public.documents d
    where d.id = document_extractions.document_id
      and d.firm_id = private.current_firm_id()
  )
)
with check (
  private.has_staff_permission('documents.review')
  and (reviewed_by is null or reviewed_by = (select auth.uid()))
);

drop policy if exists "organizers_select_client" on public.organizers;
drop policy if exists "organizers_select_staff" on public.organizers;
create policy "organizers_select_authorized"
on public.organizers for select to authenticated
using (
  client_id = private.current_client_id()
  or (
    private.is_firm_staff()
    and firm_id = private.current_firm_id()
  )
);

drop policy if exists "organizers_write_staff" on public.organizers;
create policy "organizers_insert_staff"
on public.organizers for insert to authenticated
with check (
  private.has_staff_permission('organizers.manage')
  and firm_id = private.current_firm_id()
);
create policy "organizers_update_staff"
on public.organizers for update to authenticated
using (
  private.has_staff_permission('organizers.manage')
  and firm_id = private.current_firm_id()
)
with check (
  private.has_staff_permission('organizers.manage')
  and firm_id = private.current_firm_id()
);
create policy "organizers_delete_staff"
on public.organizers for delete to authenticated
using (
  private.has_staff_permission('organizers.manage')
  and firm_id = private.current_firm_id()
);

drop policy if exists "organizer_items_select" on public.organizer_items;
create policy "organizer_items_select"
on public.organizer_items for select to authenticated
using (
  exists (
    select 1 from public.organizers o
    where o.id = organizer_items.organizer_id
      and (
        (
          private.is_firm_staff()
          and o.firm_id = private.current_firm_id()
        )
        or o.client_id = private.current_client_id()
      )
  )
);

drop policy if exists "organizer_items_write_staff" on public.organizer_items;
create policy "organizer_items_insert_staff"
on public.organizer_items for insert to authenticated
with check (
  private.has_staff_permission('organizers.manage')
  and exists (
    select 1 from public.organizers o
    where o.id = organizer_items.organizer_id
      and o.firm_id = private.current_firm_id()
  )
);
create policy "organizer_items_update_staff"
on public.organizer_items for update to authenticated
using (
  private.has_staff_permission('organizers.manage')
  and exists (
    select 1 from public.organizers o
    where o.id = organizer_items.organizer_id
      and o.firm_id = private.current_firm_id()
  )
)
with check (
  private.has_staff_permission('organizers.manage')
  and exists (
    select 1 from public.organizers o
    where o.id = organizer_items.organizer_id
      and o.firm_id = private.current_firm_id()
  )
);
create policy "organizer_items_delete_staff"
on public.organizer_items for delete to authenticated
using (
  private.has_staff_permission('organizers.manage')
  and exists (
    select 1 from public.organizers o
    where o.id = organizer_items.organizer_id
      and o.firm_id = private.current_firm_id()
  )
);

drop policy if exists "responses_select" on public.organizer_responses;
create policy "responses_select"
on public.organizer_responses for select to authenticated
using (
  exists (
    select 1
    from public.organizer_items oi
    join public.organizers o on o.id = oi.organizer_id
    where oi.id = organizer_responses.organizer_item_id
      and (
        (
          private.is_firm_staff()
          and o.firm_id = private.current_firm_id()
        )
        or o.client_id = private.current_client_id()
      )
  )
);

drop policy if exists "suggestions_select" on public.organizer_item_suggestions;
create policy "suggestions_select"
on public.organizer_item_suggestions for select to authenticated
using (
  exists (
    select 1
    from public.organizer_items oi
    join public.organizers o on o.id = oi.organizer_id
    where oi.id = organizer_item_suggestions.organizer_item_id
      and (
        (
          private.is_firm_staff()
          and o.firm_id = private.current_firm_id()
        )
        or o.client_id = private.current_client_id()
      )
  )
);

drop policy if exists "messages_select" on public.organizer_messages;
create policy "messages_select"
on public.organizer_messages for select to authenticated
using (
  exists (
    select 1 from public.organizers o
    where o.id = organizer_messages.organizer_id
      and (
        (
          private.is_firm_staff()
          and o.firm_id = private.current_firm_id()
        )
        or o.client_id = private.current_client_id()
      )
  )
);

drop policy if exists "messages_insert" on public.organizer_messages;
create policy "messages_insert"
on public.organizer_messages for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.organizers o
    where o.id = organizer_messages.organizer_id
      and (
        (
          private.is_firm_staff()
          and o.firm_id = private.current_firm_id()
        )
        or o.client_id = private.current_client_id()
      )
  )
);

drop policy if exists "templates_read_staff" on public.organizer_templates;
create policy "templates_read_staff"
on public.organizer_templates for select to authenticated
using (
  private.is_firm_staff()
  and firm_id = private.current_firm_id()
);

drop policy if exists "templates_manage_staff" on public.organizer_templates;
create policy "templates_insert_staff"
on public.organizer_templates for insert to authenticated
with check (
  private.has_staff_permission('templates.manage')
  and firm_id = private.current_firm_id()
);
create policy "templates_update_staff"
on public.organizer_templates for update to authenticated
using (
  private.has_staff_permission('templates.manage')
  and firm_id = private.current_firm_id()
)
with check (
  private.has_staff_permission('templates.manage')
  and firm_id = private.current_firm_id()
);
create policy "templates_delete_staff"
on public.organizer_templates for delete to authenticated
using (
  private.has_staff_permission('templates.manage')
  and firm_id = private.current_firm_id()
);

drop policy if exists "template_items_read_staff" on public.organizer_template_items;
create policy "template_items_read_staff"
on public.organizer_template_items for select to authenticated
using (
  exists (
    select 1 from public.organizer_templates t
    where t.id = organizer_template_items.template_id
      and t.firm_id = private.current_firm_id()
      and private.is_firm_staff()
  )
);

drop policy if exists "template_items_manage_staff" on public.organizer_template_items;
create policy "template_items_insert_staff"
on public.organizer_template_items for insert to authenticated
with check (
  private.has_staff_permission('templates.manage')
  and exists (
    select 1 from public.organizer_templates t
    where t.id = organizer_template_items.template_id
      and t.firm_id = private.current_firm_id()
  )
);
create policy "template_items_update_staff"
on public.organizer_template_items for update to authenticated
using (
  private.has_staff_permission('templates.manage')
  and exists (
    select 1 from public.organizer_templates t
    where t.id = organizer_template_items.template_id
      and t.firm_id = private.current_firm_id()
  )
)
with check (
  private.has_staff_permission('templates.manage')
  and exists (
    select 1 from public.organizer_templates t
    where t.id = organizer_template_items.template_id
      and t.firm_id = private.current_firm_id()
  )
);
create policy "template_items_delete_staff"
on public.organizer_template_items for delete to authenticated
using (
  private.has_staff_permission('templates.manage')
  and exists (
    select 1 from public.organizer_templates t
    where t.id = organizer_template_items.template_id
      and t.firm_id = private.current_firm_id()
  )
);

drop policy if exists "notifications_select_recipient" on public.notifications;
create policy "notifications_select_recipient"
on public.notifications for select to authenticated
using (
  (
    recipient_id = (select auth.uid())
    or target_client_id = private.current_client_id()
  )
  and exists (
    select 1 from public.organizers o
    where o.id = notifications.organizer_id
  )
);

drop policy if exists "tax_return_jobs_staff_insert" on public.tax_return_jobs;
create policy "tax_return_jobs_staff_insert"
on public.tax_return_jobs for insert to authenticated
with check (
  private.has_staff_permission('returns.manage')
  and firm_id = private.current_firm_id()
  and created_by = (select auth.uid())
);

drop policy if exists "storage_select_client" on storage.objects;
drop policy if exists "storage_select_staff" on storage.objects;
create policy "storage_select_authorized"
on storage.objects for select to authenticated
using (
  bucket_id = 'client-documents'
  and (
    (storage.foldername(name))[2] = private.current_client_id()::text
    or (
      private.is_firm_staff()
      and (storage.foldername(name))[1] = private.current_firm_id()::text
    )
  )
);
