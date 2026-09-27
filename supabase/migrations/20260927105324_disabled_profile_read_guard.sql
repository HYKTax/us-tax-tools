create or replace function private.is_current_profile_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and is_active
  );
$$;

drop policy if exists "profiles_select_same_firm" on public.profiles;

create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy "profiles_select_same_firm_active"
on public.profiles
for select
to authenticated
using (
  private.is_current_profile_active()
  and firm_id = private.current_firm_id()
);

revoke all on function private.is_current_profile_active() from public, anon;
grant execute on function private.is_current_profile_active() to authenticated;
