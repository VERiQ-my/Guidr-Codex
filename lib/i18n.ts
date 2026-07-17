// i18n dictionary for Guidr
// Supports: English (en), Bahasa Melayu (ms), Chinese (zh)

export type Locale = "en" | "ms" | "zh";

const dict: Record<Locale, Record<string, string>> = {
  en: {
    "nav.home": "Home",
    "nav.scan": "Scan",
    "nav.learn": "Learn",
    "nav.analytics": "Analytics",
    "nav.profile": "Profile",

    "home.greeting": "Hi, {name}! ðŸ‘‹",
    "home.tagline": "Investigate any suspicious message before you act on it.",
    "home.cta": "Investigate a message",
    "home.viewCases": "View my cases",
    "home.trendingTitle": "Top Trending Scams",
    "home.trendingSub": "Across all Guidr users",
    "home.totalCases": "Total cases filed",
    "home.reportedNSRC": "Reported to NSRC",

    "analytics.title": "Analytics",
    "analytics.subtitle": "Your investigation statistics",

    "common.back": "Back",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.loading": "Loading...",
  },

  ms: {
    "nav.home": "Utama",
    "nav.scan": "Imbas",
    "nav.learn": "Belajar",
    "nav.analytics": "Analitik",
    "nav.profile": "Profil",

    "home.greeting": "Hai, {name}! ðŸ‘‹",
    "home.tagline": "Siasat mana-mana mesej mencurigakan sebelum anda bertindak.",
    "home.cta": "Siasat mesej",
    "home.viewCases": "Lihat kes saya",
    "home.trendingTitle": "Penipuan Trending",
    "home.trendingSub": "Merentasi semua pengguna Guidr",
    "home.totalCases": "Jumlah kes difailkan",
    "home.reportedNSRC": "Dilaporkan ke NSRC",

    "analytics.title": "Analitik",
    "analytics.subtitle": "Statistik siasatan anda",

    "common.back": "Kembali",
    "common.cancel": "Batal",
    "common.save": "Simpan",
    "common.loading": "Memuatkan...",
  },

  zh: {
    "nav.home": "é¦–é¡µ",
    "nav.scan": "æ‰«æ",
    "nav.learn": "å­¦ä¹ ",
    "nav.analytics": "åˆ†æž",
    "nav.profile": "ä¸ªäºº",

    "home.greeting": "ä½ å¥½ï¼Œ{name}ï¼ðŸ‘‹",
    "home.tagline": "åœ¨é‡‡å–è¡ŒåŠ¨ä¹‹å‰ï¼Œè°ƒæŸ¥ä»»ä½•å¯ç–‘æ¶ˆæ¯ã€‚",
    "home.cta": "è°ƒæŸ¥æ¶ˆæ¯",
    "home.viewCases": "æŸ¥çœ‹æˆ‘çš„æ¡ˆä¾‹",
    "home.trendingTitle": "çƒ­é—¨è¯ˆéª—è¶‹åŠ¿",
    "home.trendingSub": "æ‰€æœ‰Guidrç”¨æˆ·",
    "home.totalCases": "å·²æäº¤æ¡ˆä¾‹æ€»æ•°",
    "home.reportedNSRC": "å·²æŠ¥å‘Šè‡³NSRC",

    "analytics.title": "åˆ†æž",
    "analytics.subtitle": "æ‚¨çš„è°ƒæŸ¥ç»Ÿè®¡",

    "common.back": "è¿”å›ž",
    "common.cancel": "å–æ¶ˆ",
    "common.save": "ä¿å­˜",
    "common.loading": "åŠ è½½ä¸­...",
  },
};

export function t(locale: Locale, key: string, params?: Record<string, string>): string {
  let text = dict[locale]?.[key] || dict.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

export default dict;
