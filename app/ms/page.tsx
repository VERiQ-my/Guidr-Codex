import type { Metadata } from "next";
import MarketingLanding from "@/app/components/MarketingLanding";
import SetHtmlLang from "@/app/components/SetHtmlLang";

// Bahasa Melayu landing. Unlike "/", there is no signed-in gate here — this
// URL exists purely so BM search queries have static, indexable content.
export const metadata: Metadata = {
  title: { absolute: "Guidr — Semak Mesej Mencurigakan, Pautan & Scam di Malaysia" },
  description:
    "Penyemak scam percuma untuk Malaysia. Tampal SMS, mesej WhatsApp, pautan atau nombor telefon yang mencurigakan dan dapatkan jawapan jelas dalam beberapa saat.",
  alternates: {
    canonical: "/ms",
    languages: { en: "/", ms: "/ms", "x-default": "/" },
  },
  // NB: a page-level openGraph REPLACES the layout's — restate the shared
  // fields (siteName/type/images) or they silently disappear.
  openGraph: {
    title: "Guidr — Semak Mesej Mencurigakan, Pautan & Scam di Malaysia",
    description:
      "Tampal SMS, mesej WhatsApp, pautan atau nombor telefon yang mencurigakan dan dapatkan jawapan jelas dalam beberapa saat. Percuma dan dibina untuk Malaysia.",
    url: "/ms",
    locale: "ms_MY",
    siteName: "Guidr",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Guidr — scam checker for Malaysia" }],
  },
};

export default function MalayLanding() {
  return (
    <>
      <SetHtmlLang lang="ms" />
      <MarketingLanding locale="ms" />
    </>
  );
}
