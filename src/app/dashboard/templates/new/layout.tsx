import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";

export default async function NewTemplateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile || !hasStaffPermission(profile, "templates.manage")) {
    redirect("/dashboard/templates");
  }

  return children;
}
