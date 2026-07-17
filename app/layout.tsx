import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientProviders from "@/app/components/ClientProviders";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for every relative URL in metadata (canonical, OG, hreflang).
  metadataBase: new URL("https://guidr.my"),
  title: {
    default: "Guidr — Security Made Simple",
    template: "%s — Guidr",
  },
  description:
    "Investigate suspicious messages, detect scams, and protect yourself from online fraud with Guidr.",
  applicationName: "Guidr",
  // Social-share defaults — WhatsApp/Telegram previews matter more than
  // Google for a scam-warning app people share with family. Pages override
  // title/description; the card image and site name are global.
  openGraph: {
    siteName: "Guidr",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Guidr — scam checker for Malaysia" }],
  },
  twitter: {
    card: "summary_large_image",
  },
  manifest: "/manifest.json",
  icons: {
    apple: "/icons/icon-192.png",
  },
  // Lets iOS run Guidr as a standalone Home Screen app — also a prerequisite
  // for web push working on iPhone/iPad (iOS 16.4+ only delivers push to
  // installed PWAs).
  appleWebApp: {
    capable: true,
    title: "Guidr",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d7377",
  width: "device-width",
  initialScale: 1,
  // Extend under the notch/home indicator so our `pb-safe`/safe-area padding
  // can position content correctly on modern phones.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /*
      suppressHydrationWarning: the inline <head> script below adds the
      `guidr-skip-splash` class to <html> BEFORE React hydrates, so the live
      DOM intentionally differs from React's render. This suppresses only
      <html>'s own attribute diff (one level deep) — child mismatches still warn.
    */
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        {/*
          Runs before React hydrates. If the session has already seen the
          splash, add a class that CSS uses to immediately hide the splash
          overlay — preventing a flash on subsequent navigations within
          the same session.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(sessionStorage.getItem('guidr_loaded'))document.documentElement.classList.add('guidr-skip-splash')}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-guidr-bg font-sans antialiased">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
