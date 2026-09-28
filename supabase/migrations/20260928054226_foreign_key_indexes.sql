create index if not exists audit_log_actor_id_idx
  on public.audit_log(actor_id);

create index if not exists clients_created_by_idx
  on public.clients(created_by);

create index if not exists document_extractions_reviewed_by_idx
  on public.document_extractions(reviewed_by);

create index if not exists documents_client_firm_idx
  on public.documents(client_id, firm_id);

create index if not exists documents_item_scope_idx
  on public.documents(organizer_item_id, organizer_id);

create index if not exists documents_organizer_scope_idx
  on public.documents(organizer_id, client_id, firm_id);

create index if not exists documents_uploaded_by_idx
  on public.documents(uploaded_by);

create index if not exists notifications_organizer_id_idx
  on public.notifications(organizer_id);

create index if not exists organizer_item_suggestions_document_id_idx
  on public.organizer_item_suggestions(document_id);

create index if not exists organizer_responses_responded_by_idx
  on public.organizer_responses(responded_by);

create index if not exists organizer_templates_created_by_idx
  on public.organizer_templates(created_by);

create index if not exists organizer_templates_firm_id_idx
  on public.organizer_templates(firm_id);

create index if not exists organizers_client_firm_idx
  on public.organizers(client_id, firm_id);

create index if not exists organizers_template_firm_idx
  on public.organizers(template_id, firm_id);
