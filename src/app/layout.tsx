import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tax Preparer Tools",
    template: "%s | Tax Preparer Tools",
  },
  description:
    "Secure client portal, tax organizers, documents, and collaboration for tax and accounting firms.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
