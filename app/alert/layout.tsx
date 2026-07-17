import type { Metadata } from "next";
import { ReactNode } from "react";

// Shared alert links are public (viewable without an account) but not meant
// for search results — they carry user-shared scan verdicts, and "/" is the
// only URL meant to rank.
export const metadata: Metadata = {
  title: "Shared alert",
  robots: { index: false, follow: false },
};

export default function AlertLayout({ children }: { children: ReactNode }) {
  return children;
}
