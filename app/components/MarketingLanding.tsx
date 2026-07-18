import Image from "next/image";
import Link from "next/link";
import GetStartedButton from "@/app/components/GetStartedButton";

type LandingLocale = "en" | "ms";

const SITE_URL = "https://guidr.my";

const copy = {
  en: {
    signIn: "Sign in",
    langSwitch: { href: "/ms", label: "Bahasa Melayu" },
    h1: "Check if a message is real or a scam",
    sub: "Paste a suspicious SMS, WhatsApp message, link, or phone number and Guidr's AI investigates it for you. You get a clear answer in plain language. Built for Malaysia.",
    cta: "Get started for free",
    haveAccount: "Already have an account?",
    whyTitle: "Why Guidr",
    features: [
      { icon: "users", title: "Protect your parents and family", body: "Become a guardian for the people you care about and get alerted when someone you protect runs into a risky message." },
      { icon: "search", title: "A clear answer, not jargon", body: "Paste text, upload a screenshot, or take a photo. Guidr tells you if it's safe or not, and explains why in simple words." },
      { icon: "bell", title: "Stay ahead of active scams", body: "Follow scam cases and alerts spreading in Malaysia right now, so you recognise them before they reach you." },
      { icon: "lock", title: "Private by design", body: "Your messages are never stored on our servers. They're checked instantly, then deleted automatically." },
    ],
    howTitle: "It's as easy as 3 steps",
    howSub: "No technical knowledge needed",
    steps: [
      { title: "You receive a suspicious message", body: "Via WhatsApp, SMS, email, or any app" },
      { title: "Share it with Guidr", body: "Paste the text, upload a screenshot, or take a photo" },
      { title: "We tell you if it's safe or not", body: "You get a clear answer with a simple explanation" },
    ],
    pricing: "Guidr is free to use. Guidr Pro unlocks unlimited daily checks and full incident reports.",
    finalCta: "Check your first message",
    metaDescription: "Free AI scam checker for Malaysia. Paste a suspicious SMS, WhatsApp message, link or phone number and get a clear answer in seconds.",
  },
  ms: {
    signIn: "Log masuk",
    langSwitch: { href: "/", label: "English" },
    h1: "Semak sama ada mesej itu benar — atau scam",
    sub: "Tampal SMS, mesej WhatsApp, pautan atau nombor telefon yang mencurigakan, dan AI Guidr akan menyiasatnya serta memberikan jawapan yang jelas dalam bahasa mudah. Dibina untuk Malaysia.",
    cta: "Mula sekarang secara percuma",
    haveAccount: "Sudah ada akaun?",
    whyTitle: "Kenapa Guidr",
    features: [
      { icon: "users", title: "Lindungi ibu bapa dan keluarga anda", body: "Jadilah penjaga (guardian) untuk orang tersayang dan terima amaran apabila mereka menerima mesej berisiko." },
      { icon: "search", title: "Jawapan jelas, bukan istilah teknikal", body: "Tampal teks, muat naik tangkapan skrin, atau ambil gambar. Guidr beritahu sama ada ia selamat dan sebabnya, dalam bahasa mudah." },
      { icon: "bell", title: "Kekal selangkah di hadapan scammer", body: "Pantau kes dan amaran penipuan yang sedang tersebar di Malaysia supaya anda mengenalinya sebelum ia sampai kepada anda." },
      { icon: "lock", title: "Privasi terjamin", body: "Mesej anda tidak pernah disimpan pada pelayan kami. Ia disemak serta-merta, kemudian dipadam secara automatik." },
    ],
    howTitle: "Semudah 3 langkah",
    howSub: "Tiada pengetahuan teknikal diperlukan",
    steps: [
      { title: "Anda menerima mesej mencurigakan", body: "Melalui WhatsApp, SMS, e-mel atau mana-mana aplikasi" },
      { title: "Kongsikan dengan Guidr", body: "Tampal teks, muat naik tangkapan skrin, atau ambil gambar" },
      { title: "Kami beritahu sama ada ia selamat", body: "Anda dapat jawapan jelas dengan penerangan mudah" },
    ],
    pricing: "Guidr percuma untuk digunakan. Guidr Pro membuka semakan harian tanpa had dan laporan insiden penuh.",
    finalCta: "Semak mesej pertama anda",
    metaDescription: "Penyemak scam percuma untuk Malaysia. Tampal SMS, mesej WhatsApp, pautan atau nombor telefon yang mencurigakan dan dapatkan jawapan jelas dalam beberapa saat.",
  },
} as const;

function FeatureIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    users: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
    search: (<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>),
    bell: (<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>),
    lock: (<><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
    shield: (<><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></>),
  };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export default function MarketingLanding({ locale }: { locale: LandingLocale }) {
  const t = copy[locale];
  const pageUrl = locale === "ms" ? `${SITE_URL}/ms` : SITE_URL;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Guidr", url: SITE_URL, logo: `${SITE_URL}/icons/icon-512.png` },
      { "@type": "WebApplication", name: "Guidr", url: pageUrl, applicationCategory: "SecurityApplication", operatingSystem: "Any", inLanguage: locale, description: t.metaDescription, offers: { "@type": "Offer", price: "0", priceCurrency: "MYR" }, publisher: { "@id": `${SITE_URL}/#organization` } },
    ],
  };

  return (
    <div className="min-h-dvh bg-guidr-bg flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-5 pt-safe-top pb-3 lg:py-4">
          <Image src="/images/Brand Logo.png" alt="Guidr" width={400} height={100} className="h-7 w-auto" priority />
          <nav className="flex items-center gap-4">
            <Link href={t.langSwitch.href} className="text-sm font-medium text-guidr-muted hover:text-guidr-text transition-colors">
              {t.langSwitch.label}
            </Link>
            <Link href="/login" className="text-sm font-semibold text-guidr-primary hover:underline">
              {t.signIn}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-5 pt-10 pb-12 lg:pt-16 lg:pb-16 text-center">
          <h1 className="text-3xl lg:text-5xl font-bold text-guidr-text leading-tight mb-4 max-w-3xl mx-auto">
            {t.h1}
          </h1>
          <p className="text-base lg:text-lg text-guidr-muted leading-relaxed max-w-2xl mx-auto mb-8">
            {t.sub}
          </p>
          <GetStartedButton className="inline-flex items-center justify-center gap-2.5 px-10 py-3.5 bg-guidr-primary-dark text-white rounded-full font-semibold text-base shadow-lg shadow-guidr-primary/20 hover:bg-guidr-primary active:scale-[0.98] transition-all">
            {t.cta}
          </GetStartedButton>
          <p className="mt-4 text-sm text-guidr-muted">
            {t.haveAccount}{" "}
            <Link href="/login" className="font-semibold text-guidr-primary hover:underline">
              {t.signIn}
            </Link>
          </p>
        </section>

        <section className="bg-white border-y border-gray-100">
          <div className="max-w-5xl mx-auto px-5 py-12 lg:py-16">
            <h2 className="text-xl lg:text-2xl font-bold text-guidr-text mb-8 text-center">
              {t.whyTitle}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {t.features.map((f) => (
                <div key={f.title} className="flex items-start gap-4 rounded-2xl p-5 bg-guidr-bg border border-gray-100">
                  <div className="w-11 h-11 rounded-xl bg-guidr-primary-light text-guidr-primary flex items-center justify-center shrink-0">
                    <FeatureIcon name={f.icon} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-guidr-text mb-1">{f.title}</h3>
                    <p className="text-sm text-guidr-muted leading-relaxed">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-5 py-12 lg:py-16">
          <div className="text-center mb-8">
            <h2 className="text-xl lg:text-2xl font-bold text-guidr-text">{t.howTitle}</h2>
            <p className="text-sm text-guidr-muted mt-1">{t.howSub}</p>
          </div>
          <ol className="grid gap-4 sm:grid-cols-3">
            {t.steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl p-5 bg-white border border-gray-100 text-center">
                <span className="inline-flex w-9 h-9 rounded-full bg-guidr-primary text-white text-sm font-bold items-center justify-center mb-3">
                  {i + 1}
                </span>
                <h3 className="text-sm font-semibold text-guidr-text mb-1">{s.title}</h3>
                <p className="text-xs text-guidr-muted leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-guidr-primary">
          <div className="max-w-5xl mx-auto px-5 py-12 lg:py-16 text-center">
            <p className="text-sm text-white/85 max-w-xl mx-auto mb-6">{t.pricing}</p>
            <GetStartedButton className="inline-flex items-center justify-center px-10 py-3.5 bg-white text-guidr-primary rounded-full font-semibold text-base hover:bg-white/90 active:scale-[0.98] transition-all">
              {t.finalCta}
            </GetStartedButton>
          </div>
        </section>
      </main>

      <footer className="max-w-5xl mx-auto w-full px-5 py-6 pb-safe-bottom flex items-center justify-between text-xs text-guidr-muted">
        <span>© {new Date().getFullYear()} Guidr</span>
        <Link href={t.langSwitch.href} className="hover:text-guidr-text transition-colors">
          {t.langSwitch.label}
        </Link>
      </footer>
    </div>
  );
}
