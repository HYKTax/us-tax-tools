import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";

export default async function NewClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile || !hasStaffPermission(profile, "clients.manage")) {
    redirect("/dashboard/clients");
  }

  return children;
}
