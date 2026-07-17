// i18n dictionary for Guidr
// Supports: English (en), Bahasa Melayu (ms), Chinese (zh)

export type Locale = "en" | "ms" | "zh";

const dict: Record<Locale, Record<string, string>> = {
  en: {
    // Nav
    "nav.home": "Home",
    "nav.scan": "Scan",
    "nav.learn": "Learn",
    "nav.analytics": "Analytics",
    "nav.profile": "Profile",

    // Home
    "home.greeting": "Hi, {name}! 👋",
    "home.tagline": "Investigate any suspicious message before you act on it.",
    "home.cta": "Investigate a message",
    "home.viewCases": "View my cases",
    "home.trendingTitle": "Top Trending Scams",
    "home.trendingSub": "Across all Guidr users",
    "home.totalCases": "Total cases filed",
    "home.reportedNSRC": "Reported to NSRC",

    // Scan
    "scan.title": "Investigate Message",
    "scan.placeholder": "Paste or type the suspicious message here...",
    "scan.submit": "Analyze Message",
    "scan.analyzing": "Investigating...",

    // Learn
    "learn.title": "Education Hub",
    "learn.subtitle": "Master cybersecurity through interactive lessons",

    // Analytics
    "analytics.title": "Analytics",
    "analytics.subtitle": "Your investigation statistics",

    // Profile
    "profile.securityLevel": "Security Level",
    "profile.casesScanned": "Scanned",
    "profile.scamsReported": "Reported",
    "profile.quizzesPassed": "Quizzes",
    "profile.verifyIdentity": "Verify My Identity",
    "profile.settings": "Settings",
    "profile.signOut": "Sign Out",

    // Settings
    "settings.title": "Configuration",
    "settings.subtitle": "Manage system preferences and high-stakes alert protocols.",
    "settings.trustedContacts": "Trusted contacts to warn",
    "settings.addContact": "Add",
    "settings.language": "Language Selection",
    "settings.layout": "Layout Skin",
    "settings.lightTheme": "Light Clinical",
    "settings.darkTheme": "Dark Forensic",
    "settings.saved": "Preferences saved!",

    // Cases
    "cases.title": "My Cases",
    "cases.empty": "No cases yet",
    "cases.emptySub": "Scan a suspicious message to start building your case history.",
    "cases.investigate": "Investigate a message",

    // Common
    "common.back": "Back",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.loading": "Loading...",
  },

  ms: {
    // Nav
    "nav.home": "Utama",
    "nav.scan": "Imbas",
    "nav.learn": "Belajar",
    "nav.analytics": "Analitik",
    "nav.profile": "Profil",

    // Home
    "home.greeting": "Hai, {name}! 👋",
    "home.tagline": "Siasat mana-mana mesej mencurigakan sebelum anda bertindak.",
    "home.cta": "Siasat mesej",
    "home.viewCases": "Lihat kes saya",
    "home.trendingTitle": "Penipuan Trending",
    "home.trendingSub": "Merentasi semua pengguna Guidr",
    "home.totalCases": "Jumlah kes difailkan",
    "home.reportedNSRC": "Dilaporkan ke NSRC",

    // Scan
    "scan.title": "Siasat Mesej",
    "scan.placeholder": "Tampal atau taip mesej mencurigakan di sini...",
    "scan.submit": "Analisis Mesej",
    "scan.analyzing": "Menyiasat...",

    // Learn
    "learn.title": "Hab Pendidikan",
    "learn.subtitle": "Kuasai keselamatan siber melalui pelajaran interaktif",

    // Analytics
    "analytics.title": "Analitik",
    "analytics.subtitle": "Statistik siasatan anda",

    // Profile
    "profile.securityLevel": "Tahap Keselamatan",
    "profile.casesScanned": "Diimbas",
    "profile.scamsReported": "Dilaporkan",
    "profile.quizzesPassed": "Kuiz",
    "profile.verifyIdentity": "Sahkan Identiti Saya",
    "profile.settings": "Tetapan",
    "profile.signOut": "Log Keluar",

    // Settings
    "settings.title": "Konfigurasi",
    "settings.subtitle": "Urus keutamaan sistem dan protokol amaran.",
    "settings.trustedContacts": "Kenalan dipercayai untuk diberi amaran",
    "settings.addContact": "Tambah",
    "settings.language": "Pilihan Bahasa",
    "settings.layout": "Kulit Reka Letak",
    "settings.lightTheme": "Klinikal Terang",
    "settings.darkTheme": "Forensik Gelap",
    "settings.saved": "Keutamaan disimpan!",

    // Cases
    "cases.title": "Kes Saya",
    "cases.empty": "Tiada kes lagi",
    "cases.emptySub": "Imbas mesej mencurigakan untuk mula membina sejarah kes anda.",
    "cases.investigate": "Siasat mesej",

    // Common
    "common.back": "Kembali",
    "common.cancel": "Batal",
    "common.save": "Simpan",
    "common.loading": "Memuatkan...",
  },

  zh: {
    // Nav
    "nav.home": "首页",
    "nav.scan": "扫描",
    "nav.learn": "学习",
    "nav.analytics": "分析",
    "nav.profile": "个人",

    // Home
    "home.greeting": "你好，{name}！👋",
    "home.tagline": "在采取行动之前，调查任何可疑消息。",
    "home.cta": "调查消息",
    "home.viewCases": "查看我的案例",
    "home.trendingTitle": "热门诈骗趋势",
    "home.trendingSub": "所有Guidr用户",
    "home.totalCases": "已提交案例总数",
    "home.reportedNSRC": "已报告至NSRC",

    // Scan
    "scan.title": "调查消息",
    "scan.placeholder": "在此粘贴或输入可疑消息...",
    "scan.submit": "分析消息",
    "scan.analyzing": "调查中...",

    // Learn
    "learn.title": "教育中心",
    "learn.subtitle": "通过互动课程掌握网络安全",

    // Analytics
    "analytics.title": "分析",
    "analytics.subtitle": "您的调查统计",

    // Profile
    "profile.securityLevel": "安全等级",
    "profile.casesScanned": "已扫描",
    "profile.scamsReported": "已举报",
    "profile.quizzesPassed": "测验",
    "profile.verifyIdentity": "验证我的身份",
    "profile.settings": "设置",
    "profile.signOut": "退出登录",

    // Settings
    "settings.title": "配置",
    "settings.subtitle": "管理系统偏好和高风险警报协议。",
    "settings.trustedContacts": "要警告的可信联系人",
    "settings.addContact": "添加",
    "settings.language": "语言选择",
    "settings.layout": "布局皮肤",
    "settings.lightTheme": "明亮临床",
    "settings.darkTheme": "暗色取证",
    "settings.saved": "偏好已保存！",

    // Cases
    "cases.title": "我的案例",
    "cases.empty": "暂无案例",
    "cases.emptySub": "扫描可疑消息以开始建立您的案例历史。",
    "cases.investigate": "调查消息",

    // Common
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
