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

    "home.greeting": "Hi, {name}! 👋",
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

    "home.greeting": "Hai, {name}! 👋",
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
    "nav.home": "首页",
    "nav.scan": "扫描",
    "nav.learn": "学习",
    "nav.analytics": "分析",
    "nav.profile": "个人",

    "home.greeting": "你好，{name}！👋",
    "home.tagline": "在采取行动之前，调查任何可疑消息。",
    "home.cta": "调查消息",
    "home.viewCases": "查看我的案例",
    "home.trendingTitle": "热门诈骗趋势",
    "home.trendingSub": "所有Guidr用户",
    "home.totalCases": "已提交案例总数",
    "home.reportedNSRC": "已报告至NSRC",

    "analytics.title": "分析",
    "analytics.subtitle": "您的调查统计",

    "common.back": "返回",
    "common.cancel": "取消",
    "common.save": "保存",
    "common.loading": "加载中...",
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
