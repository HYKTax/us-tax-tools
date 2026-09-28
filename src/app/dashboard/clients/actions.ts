"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

export type CreateClientState = {
  status: "idle" | "error";
  message?: string;
};

export async function createClientRecord(
  _prevState: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "clients.manage")) {
    return { status: "error", message: "Your role cannot create clients." };
  }

  const primary_contact_name = String(formData.get("primary_contact_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const client_type = String(formData.get("client_type") ?? "individual");

  if (!primary_contact_name || !email || !email.includes("@")) {
    return { status: "error", message: "Enter a name and a valid email." };
  }

  const supabase = await createSupabaseClient();
  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      firm_id: profile.firm_id,
      primary_contact_name,
      email,
      client_type,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) {
    // Most likely the unique (firm_id, email) constraint — a friendlier
    // message than the raw Postgres error for that specific, expected case.
    if (error.code === "23505") {
      return { status: "error", message: "A client with that email already exists." };
    }
    return { status: "error", message: error.message };
  }

  redirect(`/dashboard/clients/${client.id}`);
}


export type ClientImportRow = {
  primary_contact_name: string;
  email: string;
  client_type?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state_region?: string;
  postal_code?: string;
  country?: string;
  preferred_contact_method?: string;
};

export async function importClientRecords(
  rows: ClientImportRow[]
): Promise<{
  error?: string;
  success?: boolean;
  created?: number;
  skipped?: number;
}> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "clients.manage")) {
    return { error: "Your role cannot import clients." };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: "Upload at least one client row." };
  }
  if (rows.length > 500) {
    return { error: "Import no more than 500 clients at a time." };
  }

  const normalized = rows.map((row, index) => {
    const name = String(row.primary_contact_name ?? "").trim();
    const email = String(row.email ?? "").trim().toLowerCase();
    const clientType = String(row.client_type ?? "individual").trim().toLowerCase();
    const preferred = String(row.preferred_contact_method ?? "portal").trim().toLowerCase();

    if (!name || name.length > 200) {
      throw new Error(`Row ${index + 1}: enter a client name up to 200 characters.`);
    }
    if (!email || !email.includes("@") || email.length > 320) {
      throw new Error(`Row ${index + 1}: enter a valid email address.`);
    }
    if (!["individual", "business"].includes(clientType)) {
      throw new Error(`Row ${index + 1}: client_type must be individual or business.`);
    }
    if (!["portal", "email", "phone"].includes(preferred)) {
      throw new Error(`Row ${index + 1}: preferred_contact_method must be portal, email, or phone.`);
    }

    const clean = (value: string | undefined, max: number, label: string) => {
      const result = String(value ?? "").trim();
      if (result.length > max) {
        throw new Error(`Row ${index + 1}: ${label} is too long.`);
      }
      return result || null;
    };

    return {
      firm_id: profile.firm_id,
      primary_contact_name: name,
      email,
      client_type: clientType,
      phone: clean(row.phone, 40, "phone"),
      address_line1: clean(row.address_line1, 200, "address_line1"),
      address_line2: clean(row.address_line2, 200, "address_line2"),
      city: clean(row.city, 100, "city"),
      state_region: clean(row.state_region, 100, "state_region"),
      postal_code: clean(row.postal_code, 30, "postal_code"),
      country: clean(row.country, 100, "country"),
      preferred_contact_method: preferred,
      created_by: profile.id,
    };
  });

  const seen = new Set<string>();
  for (const row of normalized) {
    if (seen.has(row.email)) {
      return { error: `Duplicate email appears more than once in the CSV: ${row.email}` };
    }
    seen.add(row.email);
  }

  const supabase = await createSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("clients")
    .select("email")
    .limit(5000);

  if (existingError) {
    return { error: "Existing clients could not be checked before import." };
  }

  const existingEmails = new Set(
    (existing ?? []).map((client) => String(client.email).trim().toLowerCase())
  );
  const toCreate = normalized.filter((row) => !existingEmails.has(row.email));
  const skipped = normalized.length - toCreate.length;

  if (toCreate.length === 0) {
    return { success: true, created: 0, skipped };
  }

  const { error } = await supabase.from("clients").insert(toCreate);
  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "Another client with one of these emails was created while the import was running. Refresh and retry.",
      };
    }
    return { error: error.message };
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/clients");

  return {
    success: true,
    created: toCreate.length,
    skipped,
  };
}
