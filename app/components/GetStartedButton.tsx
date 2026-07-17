"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Landing-page CTA. Mirrors the routing the signed-out redirect used to do:
 * first-time visitors go through onboarding, returning visitors straight to
 * login. A button (not a link) on purpose — neither destination should
 * receive link equity from the landing page, and the target depends on
 * device-local state.
 */
export default function GetStartedButton({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const handleClick = () => {
    let onboarded = false;
    try {
      onboarded = localStorage.getItem("guidr_onboarded") === "1";
    } catch {
      /* storage disabled — treat as not yet onboarded */
    }
    router.push(onboarded ? "/login" : "/onboarding");
  };

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
