"use client";

import { ReactNode } from "react";
import { useUser } from "@/app/context/UserContext";

/**
 * Chooses what "/" shows: the authenticated app home for signed-in users,
 * the public marketing landing for everyone else.
 *
 * While auth is still resolving we show the marketing view, NOT a skeleton:
 * the server render (user === null) must emit the landing's real HTML so
 * search engines index content instead of placeholder boxes. The trade-off
 * is that a signed-in user hard-reloading "/" sees the landing for the
 * moment it takes Firebase auth to resolve; the first-visit splash overlay
 * masks this in most sessions.
 */
export default function LandingGate({
  marketing,
  app,
}: {
  marketing: ReactNode;
  app: ReactNode;
}) {
  const { user } = useUser();
  return <>{user ? app : marketing}</>;
}
