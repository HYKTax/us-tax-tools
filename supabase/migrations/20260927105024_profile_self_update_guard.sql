grant update on public.profiles to authenticated;

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create or replace function private.guard_profile_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id then
    if new.firm_id is distinct from old.firm_id
       or new.role is distinct from old.role
       or new.email is distinct from old.email
       or new.is_active is distinct from old.is_active
       or new.created_at is distinct from old.created_at then
      raise exception 'Only your display name can be updated directly';
    end if;
  elsif not private.is_firm_admin() then
    raise exception 'Only a firm administrator can update another staff profile';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_sensitive_update on public.profiles;
create trigger profiles_guard_sensitive_update
before update on public.profiles
for each row execute function private.guard_profile_sensitive_update();

revoke all on function private.guard_profile_sensitive_update() from public, anon, authenticated;
