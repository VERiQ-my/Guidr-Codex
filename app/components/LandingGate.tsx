"use client";

import { ReactNode } from "react";
import { useUser } from "@/app/context/UserContext";

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
