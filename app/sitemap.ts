import type { MetadataRoute } from "next";

// Only the public marketing landings belong here — everything else is
// noindexed app UI behind sign-in.
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = {
    en: "https://guidr.my",
    ms: "https://guidr.my/ms",
  };
  return [
    { url: "https://guidr.my", alternates: { languages } },
    { url: "https://guidr.my/ms", alternates: { languages } },
  ];
}
