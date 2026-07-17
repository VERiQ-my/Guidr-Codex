"use client";

import { useEffect } from "react";

/**
 * The root layout hardcodes <html lang="en"> and owns the only <html> tag,
 * so localized routes correct the attribute client-side. Crawlers rely on
 * hreflang + content-language detection, so the SSR value being "en" for a
 * beat is fine — this mainly keeps screen readers pronouncing BM correctly.
 */
export default function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [lang]);

  return null;
}
