"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

type TaskResult = { error?: string; success?: boolean };

const priorities = new Set(["low", "normal", "high", "urgent"]);
const statuses = new Set(["open", "in_progress", "done"]);

async function taskContext() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "tasks.manage")) {
    return { error: "Your role cannot manage internal tasks." as const };
  }
  return { profile, supabase: await createClient() };
}

export async function createStaffTask(input: {
  title: string;
  details?: string;
  clientId?: string;
  taxReturnJobId?: string;
  assignedTo?: string;
  priority: string;
  dueDate?: string;
}): Promise<TaskResult> {
  const context = await taskContext();
  if ("error" in context) return { error: context.error };

  const title = input.title.trim();
  const details = input.details?.trim() || null;

  if (!title || title.length > 240) return { error: "Enter a task title up to 240 characters." };
  if (details && details.length > 5000) return { error: "Task details must be 5000 characters or fewer." };
  if (!priorities.has(input.priority)) return { error: "Choose a valid priority." };

  const { error } = await context.supabase.from("staff_tasks").insert({
    firm_id: context.profile.firm_id,
    client_id: input.clientId || null,
    tax_return_job_id: input.taxReturnJobId || null,
    title,
    details,
    priority: input.priority,
    due_date: input.dueDate || null,
    assigned_to: input.assignedTo || null,
    created_by: context.profile.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
  if (input.clientId) revalidatePath(`/dashboard/clients/${input.clientId}`);
  if (input.taxReturnJobId) revalidatePath(`/dashboard/work/${input.taxReturnJobId}`);
  return { success: true };
}

export async function updateStaffTaskStatus(
  taskId: string,
  status: string
): Promise<TaskResult> {
  const context = await taskContext();
  if ("error" in context) return { error: context.error };
  if (!statuses.has(status)) return { error: "Choose a valid task status." };

  const { data, error } = await context.supabase
    .from("staff_tasks")
    .update({ status })
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "Task could not be updated." };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
  return { success: true };
}

export async function deleteStaffTask(taskId: string): Promise<TaskResult> {
  const context = await taskContext();
  if ("error" in context) return { error: context.error };

  const { data, error } = await context.supabase
    .from("staff_tasks")
    .delete()
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "You cannot delete this task." };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
  return { success: true };
}
