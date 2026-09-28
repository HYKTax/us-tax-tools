revoke execute on function public.admin_update_staff(uuid, public.profile_role, boolean)
from authenticated;

revoke execute on function private.has_current_return_approval(uuid, integer)
from authenticated;

revoke execute on function private.can_be_preparer(uuid, uuid)
from authenticated;

revoke execute on function private.can_be_reviewer(uuid, uuid)
from authenticated;
