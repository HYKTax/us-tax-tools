revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

drop policy if exists "profiles_select_self" on public.profiles;
drop policy if exists "profiles_select_same_firm_active" on public.profiles;
drop policy if exists "profiles_select_authorized" on public.profiles;

create policy "profiles_select_authorized"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (
    private.is_current_profile_active()
    and (
      (private.is_firm_staff() and firm_id = private.current_firm_id())
      or (
        firm_id = private.current_firm_id()
        and role in ('firm_admin','firm_staff')
        and exists (
          select 1
          from public.organizers o
          where o.created_by = profiles.id
            and o.client_id = private.current_client_id()
        )
      )
    )
  )
);
