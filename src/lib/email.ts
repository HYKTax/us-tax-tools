import "server-only";
import { Resend } from "resend";

export function notificationEmailConfigStatus() {
  const missing: string[] = [];

  if (!process.env.RESEND_API_KEY?.trim()) missing.push("RESEND_API_KEY");
  if (!process.env.EMAIL_FROM?.trim()) missing.push("EMAIL_FROM");
  if (!process.env.NEXT_PUBLIC_SITE_URL?.trim()) missing.push("NEXT_PUBLIC_SITE_URL");

  return {
    configured: missing.length === 0,
    missing,
  };
}

export function notificationEmailConfigured() {
  return notificationEmailConfigStatus().configured;
}

// Provider acceptance is not proof of delivery. Never log recipient or content.
export async function sendNotificationEmail(input: {
  to: string; subject: string; text: string; idempotencyKey: string;
}): Promise<boolean> {
  if (!notificationEmailConfigured()) return false;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM!, to: input.to, subject: input.subject, text: input.text,
    }, { idempotencyKey: input.idempotencyKey });
    return !error;
  } catch {
    return false;
  }
}
