"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Onboarding() {
  const router = useRouter();
  useEffect(() => {
    try {
      localStorage.setItem("guidr_onboarded", "1");
    } catch {}
    router.replace("/login");
  }, [router]);
  return null;
}
