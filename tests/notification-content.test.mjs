import { test } from "node:test";
import assert from "node:assert/strict";
import {
  notificationContent,
  notificationLabels,
} from "../src/lib/notification-content.ts";

test("return review notifications link to the secure return workspace", () => {
  const result = notificationContent("tax_return_review_requested", {
    organizerId: null,
    taxReturnJobId: "return-123",
    forClient: false,
    siteUrl: "https://portal.example.com",
  });

  assert.equal(result.subject, "Tax return ready for review");
  assert.match(result.text, /https:\/\/portal\.example\.com\/dashboard\/work\/return-123/);
});

test("organizer notifications preserve client and staff routing", () => {
  const client = notificationContent("organizer_sent", {
    organizerId: "org-123",
    taxReturnJobId: null,
    forClient: true,
    siteUrl: "https://portal.example.com",
  });
  const staff = notificationContent("organizer_submitted", {
    organizerId: "org-123",
    taxReturnJobId: null,
    forClient: false,
    siteUrl: "https://portal.example.com",
  });

  assert.match(client.text, /\/portal\/organizers\/org-123/);
  assert.match(staff.text, /\/dashboard\/organizers\/org-123/);
  assert.equal(notificationLabels.tax_return_review_approved, "Tax return review approved");
});


test("released final-return notifications send clients to Returns", () => {
  const result = notificationContent("tax_return_copy_released", {
    organizerId: null,
    taxReturnJobId: "return-456",
    forClient: true,
    siteUrl: "https://portal.example.com",
  });

  assert.equal(result.subject, "Final tax return available");
  assert.match(result.text, /https:\/\/portal\.example\.com\/portal\/returns/);
  assert.doesNotMatch(result.text, /dashboard\/work/);
});
