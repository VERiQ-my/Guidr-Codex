import type { Metadata } from "next";
import { ReactNode } from "react";

// The page itself is a client component, so its metadata lives here.
// noindex: the landing page at "/" is the only URL meant to rank — a bare
// login form in search results is a bad first impression and splits equity.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
