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
              'templates.manage',
              'audit.view'
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

drop policy if exists "audit_log_select_staff" on public.audit_log;
create policy "audit_log_select_staff"
on public.audit_log
for select
to authenticated
using (
  private.has_staff_permission('audit.view')
  and firm_id = private.current_firm_id()
);
