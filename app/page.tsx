import type { Metadata } from "next";
import Header from "@/app/components/Header";
import HeroSection from "@/app/components/HeroSection";
import StatsCards from "@/app/components/StatsCards";
import HowItWorks from "@/app/components/HowItWorks";
import BottomNav from "@/app/components/BottomNav";
import LandingGate from "@/app/components/LandingGate";
import MarketingLanding from "@/app/components/MarketingLanding";

// The one page search engines index — title/description are written for the
// SERP, not the app chrome. `title` is absolute (not the layout template) so
// the brand leads.
export const metadata: Metadata = {
  title: { absolute: "Guidr — Check Suspicious Messages, Links & Scams in Malaysia" },
  description:
    "Free AI scam checker for Malaysia. Paste a suspicious SMS, WhatsApp message, link or phone number and get a clear answer in seconds. Private, built for Malaysia.",
  alternates: {
    canonical: "/",
    languages: { en: "/", ms: "/ms", "x-default": "/" },
  },
  // NB: a page-level openGraph REPLACES the layout's — restate the shared
  // fields (siteName/type/images) or they silently disappear.
  openGraph: {
    title: "Guidr — Check Suspicious Messages, Links & Scams in Malaysia",
    description:
      "Paste a suspicious SMS, WhatsApp message, link or phone number and get a clear answer in seconds. Free, private, built for Malaysia.",
    url: "/",
    locale: "en_MY",
    siteName: "Guidr",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Guidr — scam checker for Malaysia" }],
  },
};

export default function Home() {
  return (
    <LandingGate
      marketing={<MarketingLanding locale="en" />}
      app={
        <div className="guidr-container">
          <Header />

          <main className="flex-1 overflow-y-auto no-scrollbar pb-safe">
            <HeroSection />
            <StatsCards />
            <HowItWorks />
          </main>

          <BottomNav />
        </div>
      }
    />
  );
}
