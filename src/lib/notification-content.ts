export const notificationLabels: Record<string, string> = {
  message: "New message",
  organizer_sent: "New organizer ready",
  organizer_started: "Client started their organizer",
  organizer_submitted: "Organizer submitted for review",
  organizer_reviewed: "Organizer review completed",
  changes_requested: "Changes requested on your organizer",
  organizer_updated: "Organizer updated",
  tax_return_review_requested: "Tax return ready for review",
  tax_return_review_changes_requested: "Tax return changes requested",
  tax_return_review_approved: "Tax return review approved",
  tax_return_copy_released: "Final tax return available",
  tax_return_copy_withdrawn: "Tax return document updated",
};

export function notificationContent(
  kind: string,
  target: {
    organizerId: string | null;
    taxReturnJobId: string | null;
    forClient: boolean;
    siteUrl: string;
  }
) {
  const origin = new URL(target.siteUrl);
  if (!["http:", "https:"].includes(origin.protocol)) {
    throw new Error("Invalid portal URL");
  }

  const path = target.taxReturnJobId
    ? target.forClient
      ? "/portal/returns"
      : `/dashboard/work/${target.taxReturnJobId}`
    : target.organizerId
      ? `/${target.forClient ? "portal" : "dashboard"}/organizers/${target.organizerId}`
      : target.forClient
        ? "/portal"
        : "/dashboard";

  const subject = notificationLabels[kind] ?? "Portal notification";

  return {
    subject,
    text:
      subject +
      ". Sign in to your secure portal to view the details.\n\n" +
      new URL(path, origin.origin).href,
  };
}
