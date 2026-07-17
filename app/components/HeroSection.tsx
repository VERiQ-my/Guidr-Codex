"use client";

import Link from "next/link";
import { useUser } from "@/app/context/UserContext";
import { usePrefs } from "@/app/context/PrefsContext";

export default function HeroSection() {
  const { user } = useUser();
  const { tr } = usePrefs();
  const displayName = user?.fullName || user?.username || "there";

  return (
    <section className="px-5 pt-6 pb-4 lg:px-0 lg:pt-10 lg:pb-6 guidr-animate-in guidr-stagger-1">
      <p className="text-sm font-medium text-guidr-primary mb-3">
        {tr("home.greeting", { name: displayName })}
      </p>

      <h2 className="text-2xl lg:text-4xl font-bold text-guidr-text leading-tight mb-6 lg:max-w-3xl">
        {tr("home.tagline")}
      </h2>

      <Link
        href="/scan"
        className="flex items-center justify-center gap-2.5 w-full lg:w-auto lg:inline-flex lg:px-10 py-3.5 px-6 bg-guidr-primary-dark text-white rounded-full font-semibold text-base shadow-lg shadow-guidr-primary/20 hover:bg-guidr-primary active:scale-[0.98] transition-all"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        {tr("home.cta")}
      </Link>

      <Link
        href="/cases"
        className="flex items-center justify-center gap-1 mt-4 text-sm font-medium text-guidr-primary hover:underline transition-colors"
      >
        {tr("home.viewCases")}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </Link>
    </section>
  );
}
