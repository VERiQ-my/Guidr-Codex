"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";

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
      /* storage disabled â€” treat as not yet onboarded */
    }
    router.push(onboarded ? "/login" : "/onboarding");
  };

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
