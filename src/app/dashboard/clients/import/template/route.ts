const header = [
  "primary_contact_name",
  "email",
  "client_type",
  "phone",
  "address_line1",
  "address_line2",
  "city",
  "state_region",
  "postal_code",
  "country",
  "preferred_contact_method",
].join(",");

const example = [
  "John Smith",
  "john@example.com",
  "individual",
  "+1 555 555 0100",
  "100 Main St",
  "",
  "Chicago",
  "IL",
  "60601",
  "USA",
  "portal",
]
  .map((value) => '"' + value.replaceAll('"', '""') + '"')
  .join(",");

export async function GET() {
  return new Response(header + "\r\n" + example + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="client-import-template.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
