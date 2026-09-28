import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type CalendarRow = {
  id: string;
  tax_year: number;
  return_type: string;
  status: string;
  due_date: string;
  clients: { primary_contact_name: string } | null;
};

function escapeIcs(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function dateValue(date: string) {
  return date.replaceAll("-", "");
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "client" || !profile.is_active) {
    return new Response("Not authorized", { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_return_jobs")
    .select("id,tax_year,return_type,status,due_date,clients(primary_contact_name)")
    .not("due_date", "is", null)
    .not("status", "in", '("accepted","completed")')
    .order("due_date", { ascending: true })
    .limit(2000);

  if (error) {
    return new Response("Unable to export deadlines.", { status: 500 });
  }

  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const events = ((data ?? []) as unknown as CalendarRow[])
    .filter((row) => Boolean(row.due_date))
    .map((row) => {
      const client = row.clients?.primary_contact_name ?? "Client";
      const summary = escapeIcs(`${row.tax_year} ${row.return_type} - ${client}`);
      const description = escapeIcs(
        `Tax return deadline. Current workflow stage: ${row.status.replaceAll("_", " ")}.`
      );
      return [
        "BEGIN:VEVENT",
        `UID:${row.id}@portal.taxpreparertools.com`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${dateValue(row.due_date)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        "END:VEVENT",
      ].join("\r\n");
    });

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tax Preparer Tools//Firm Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tax-return-deadlines.ics"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
