import type { Metadata } from "next";
import { ReactNode } from "react";

// The page itself is a client component, so its metadata lives here.
// noindex: onboarding is a funnel step, not a search destination — "/" is
// the only URL meant to rank.
export const metadata: Metadata = {
  title: "Get started",
  robots: { index: false, follow: true },
};

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return children;
}
