import type { Metadata } from "next";
import InviteClient from "./InviteClient";

/**
 * Guardian invite landing. Reached from a link the ward sent over WhatsApp/SMS,
 * so most visitors arrive signed out and having never heard of Guidr.
 *
 * noindex: an invite is a private capability, not a page for search engines
 * (only / and /ms are indexable). The OG card is deliberately generic — the
 * ward's name must not leak into a link preview if the invite gets forwarded
 * into a group chat.
 */
export const metadata: Metadata = {
  title: { absolute: "Be someone's Guardian on Guidr" },
  description:
    "Someone you know wants you to look out for them. Guidr alerts you if they run into a real scam.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Be someone's Guardian on Guidr",
    description:
      "Someone you know wants you to look out for them. You'll get an alert if they run into a real scam.",
    siteName: "Guidr",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Guidr" }],
  },
};

export default async function GuardianInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteClient token={token} />;
}
