create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 5000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_notes_client_created_idx
  on public.client_notes(client_id, is_pinned desc, created_at desc);

create index if not exists client_notes_author_idx
  on public.client_notes(author_id);

alter table public.client_notes enable row level security;

drop policy if exists "client_notes_staff_select" on public.client_notes;
create policy "client_notes_staff_select"
on public.client_notes
for select
to authenticated
using (
  private.is_firm_staff()
  and firm_id = private.current_firm_id()
);

drop policy if exists "client_notes_staff_insert" on public.client_notes;
create policy "client_notes_staff_insert"
on public.client_notes
for insert
to authenticated
with check (
  private.is_firm_staff()
  and firm_id = private.current_firm_id()
  and author_id = (select auth.uid())
  and exists (
    select 1
    from clients c
    where c.id = client_id
      and c.firm_id = firm_id
  )
);

drop policy if exists "client_notes_author_or_manager_update" on public.client_notes;
create policy "client_notes_author_or_manager_update"
on public.client_notes
for update
to authenticated
using (
  firm_id = private.current_firm_id()
  and (
    author_id = (select auth.uid())
    or exists (
      select 1 from profiles p
      where p.id = (select auth.uid())
        and p.is_active
        and p.firm_id = client_notes.firm_id
        and (
          p.role = 'firm_admin'
          or p.staff_role in ('admin','manager')
        )
    )
  )
)
with check (
  firm_id = private.current_firm_id()
  and exists (
    select 1
    from clients c
    where c.id = client_id
      and c.firm_id = firm_id
  )
);

drop policy if exists "client_notes_author_or_manager_delete" on public.client_notes;
create policy "client_notes_author_or_manager_delete"
on public.client_notes
for delete
to authenticated
using (
  firm_id = private.current_firm_id()
  and (
    author_id = (select auth.uid())
    or exists (
      select 1 from profiles p
      where p.id = (select auth.uid())
        and p.is_active
        and p.firm_id = client_notes.firm_id
        and (
          p.role = 'firm_admin'
          or p.staff_role in ('admin','manager')
        )
    )
  )
);

grant select, insert, update, delete on public.client_notes to authenticated;

create or replace function private.client_notes_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_notes_set_updated_at on public.client_notes;
create trigger client_notes_set_updated_at
before update on public.client_notes
for each row execute function private.client_notes_set_updated_at();

create or replace function private.audit_client_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row client_notes;
  v_action text;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  v_action := case
    when tg_op = 'INSERT' then 'client_note.created'
    when tg_op = 'DELETE' then 'client_note.deleted'
    else 'client_note.updated'
  end;

  insert into audit_log(firm_id,actor_id,action,target_type,target_id,metadata)
  values(
    v_row.firm_id,
    auth.uid(),
    v_action,
    'client',
    v_row.client_id,
    jsonb_build_object('note_id',v_row.id,'is_pinned',v_row.is_pinned)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists client_notes_audit on public.client_notes;
create trigger client_notes_audit
after insert or update or delete on public.client_notes
for each row execute function private.audit_client_note();

revoke all on function private.client_notes_set_updated_at(),
  private.audit_client_note()
from public, anon, authenticated;
