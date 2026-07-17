# Codex Build Prompt — Guidr Home & Analytics (self-contained, empty folder)

> **Task for Codex:** In a **brand-new empty folder**, build a faithful, running
> port of Guidr's **Home page (`/`)** and **Analytics page (`/analytics`)**. This
> is an **exact port** — every file below is the real Guidr source and must be
> created **verbatim** unless it is explicitly marked `(minimal)`. Files marked
> `(minimal)` are tiny replacements for out-of-scope plumbing so the two pages
> compile and run standalone. Do not "improve", restyle, or rename anything that
> is marked verbatim — reproduce the copy, Tailwind classes, and behavior exactly.

---

## 0. Read this first

1. **This is NOT the Next.js you were trained on.** The project is **Next.js 16**
   (App Router), which has breaking changes vs. Next 13/14/15. **Before touching
   any `layout`, `page`, route handler, `metadata`/`viewport` export, or caching
   API, read the relevant guide in `node_modules/next/dist/docs/`** and heed
   deprecation notices. Do not assume Pages Router.
2. **The user will supply the real brand image assets** (binary PNGs) — see §3.
   Do not invent logos; reference the exact paths and let the user drop the files
   in. The build must not hard-fail if an image is briefly missing.
3. **Build order:** create the config files (§2) → `npm install` → create every
   source file (§4–§13) → copy assets (§3) → add `.env.local` (§2.6) → seed
   Firestore (§14) → `npm run dev`.

---

## 1. Stack (do not substitute)

| Concern | Choice |
|---|---|
| Framework | **Next.js 16** (`^16.2.6`), **App Router**, dev on Turbopack |
| UI | **React 19** (`19.2.4`) + **react-dom 19** |
| Styling | **Tailwind CSS v4** (`^4.3.0`) via `@tailwindcss/postcss` — theme is declared in CSS with `@theme`, **no** `tailwind.config.js` |
| Language | **TypeScript** `^5`, `strict` |
| Data | **Firebase Web SDK v12** — Auth + Firestore, client realtime listeners |
| Font | `next/font/google` → **Inter**, CSS var `--font-inter` |
| Alias | `@/*` → project root |

Client components begin with `"use client";`. Server components (default) never
import the client Firebase SDK.

---

## 2. Config files (create these first)

### 2.1 `package.json` (minimal)
```json
{
  "name": "guidr-codex",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "firebase": "^12.13.0",
    "next": "^16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.6",
    "postcss": "^8.5.14",
    "tailwindcss": "^4.3.0",
    "typescript": "^5"
  }
}
```

### 2.2 `tsconfig.json` (verbatim)
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 2.3 `next.config.ts` (minimal — Cloudflare/OpenNext bits removed)
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### 2.4 `postcss.config.mjs` (verbatim)
```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

### 2.5 `eslint.config.mjs` (minimal)
```js
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [...compat.extends("next/core-web-vitals", "next/typescript")];
```

### 2.6 `.env.local` (template — user fills with their Firebase web config)
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
# Optional: point at the local Firebase emulator instead of prod
# NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
```

---

## 3. Brand assets (user copies these — do NOT generate)

Create the folders and have the user copy these files from the current Guidr repo,
same paths. Visible on Home/Analytics, so branding must match:

| Copy from current repo | Into new folder | Used by |
|---|---|---|
| `public/images/Brand Logo.png` | `public/images/Brand Logo.png` | Header, sidebar, marketing landing |
| `public/images/Brand Icon.png` | `public/images/Brand Icon.png` | BottomNav scan button, sidebar |
| `public/og.png` | `public/og.png` | social share card (metadata) |
| `public/icons/icon-192.png` | `public/icons/icon-192.png` | manifest / apple icon |
| `public/icons/icon-512.png` | `public/icons/icon-512.png` | manifest |
| `app/favicon.ico` | `app/favicon.ico` | favicon |

`public/manifest.json` is created as text in §13.

---

## 4. `lib/logger.ts` (minimal)
```ts
type Args = unknown[];

export const logger = {
  log: (...a: Args) => {
    if (process.env.NODE_ENV !== "production") console.log(...a);
  },
  warn: (...a: Args) => console.warn(...a),
  error: (...a: Args) => console.error(...a),
};
```

## 5. `lib/firebase.ts` (verbatim)
```ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let db: Firestore;
try {
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
} catch {
  db = getFirestore(app);
}

let _firestoreEmulatorConnected = false;
if (USE_EMULATOR && !_firestoreEmulatorConnected) {
  try {
    connectFirestoreEmulator(db, "localhost", 8080);
    _firestoreEmulatorConnected = true;
  } catch {
    // Already connected (HMR re-eval) — safe to ignore.
  }
}

let _auth: Auth | undefined;
const auth = new Proxy({} as Auth, {
  get(_target, prop) {
    if (!_auth) {
      _auth = getAuth(app);
      if (USE_EMULATOR) {
        try {
          connectAuthEmulator(_auth, "http://localhost:9099");
        } catch {
          // Already connected (HMR re-eval) — safe to ignore.
        }
      }
    }
    const value = _auth[prop as keyof Auth];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(_auth) : value;
  },
  set(_target, prop, value) {
    _auth ??= getAuth(app);
    (_auth as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  },
});

export { app, db, auth };
```

## 6. `lib/i18n.ts` (verbatim)
```ts
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
```
> The full dictionary in the source repo also has `scan.*`, `learn.*`,
> `profile.*`, `settings.*`, `cases.*` keys. They are unused by Home/Analytics —
> keep only the keys above, or port the full file if you have it.

## 7. `lib/scam-categories.ts` (verbatim)
```ts
interface ScamCategory {
  name: string;
  keywords: string[];
}

const CATEGORIES: ScamCategory[] = [
  { name: "Crypto Scam",          keywords: ["crypto", "bitcoin", "ether", "btc", "blockchain", "nft", "web3"] },
  { name: "Investment Scam",      keywords: ["invest", "trading", "stock", "forex", "fund", "return on", "high return"] },
  { name: "Romance Scam",         keywords: ["romance", "dating", "relationship", "love scam"] },
  { name: "Lottery Scam",         keywords: ["lottery", "prize", "winner", "jackpot", "lucky draw", "you won", "you've won"] },
  { name: "Job Scam",             keywords: ["job", "recruit", "interview", "employ", "hiring", "vacancy", "career", "task-based"] },
  { name: "Loan Scam",            keywords: ["loan", "pinjaman", "kredit peribadi", "instant credit"] },
  { name: "Online Shopping Scam", keywords: ["shopping", "purchase", "e-commerce", "shopee", "lazada", "fake product", "fake order"] },
  { name: "Tech Support Scam",    keywords: ["tech support", "technical support", "virus", "microsoft support", "apple support"] },
  { name: "Delivery Scam",        keywords: ["delivery", "parcel", "package", "courier", "pos malaysia", "shipping", "customs"] },
  { name: "Charity Scam",         keywords: ["charity", "donat", "fundrais", "nonprofit"] },
  { name: "Impersonation",        keywords: ["impersonat", "lhdn", "polis", "police", "bank impersonat", "government", "macc", "spr", "tnb"] },
  { name: "Phishing",             keywords: ["phish", "credential", "otp", "password reset", "verify your account", "account suspended"] },
];

const SAFE_TOKENS = new Set(["none", "n/a", "na", "not applicable", "safe", "legitimate", "legit"]);

export const SAFE_CATEGORY = "None";

export const CANONICAL_SCAM_CATEGORIES = [
  ...CATEGORIES.map((c) => c.name),
  "Other",
  SAFE_CATEGORY,
] as const;

export function normalizeScamType(raw: string | undefined | null): string {
  if (!raw) return "Other";
  const input = raw.toLowerCase().trim();
  if (!input || SAFE_TOKENS.has(input)) return SAFE_CATEGORY;

  for (const cat of CATEGORIES) {
    if (cat.keywords.some((kw) => input.includes(kw))) return cat.name;
  }
  return "Other";
}

export function formatTrend(cases7d: number, casesPrev7d: number): string {
  if (casesPrev7d === 0) {
    return cases7d > 0 ? "+New" : "+0%";
  }
  const pct = Math.round(((cases7d - casesPrev7d) / casesPrev7d) * 100);
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}%`;
}
```

## 8. `lib/firestore.ts` (minimal — only the read paths Home/Analytics use)
```ts
import { logger } from "./logger";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

/** Swallow the transient permission-denied that happens while the auth token
 *  propagates to Firestore on sign-in; surface anything else. */
function handleListenerError(label: string) {
  return (err: { code?: string; message?: string }) => {
    if (err.code === "permission-denied") return;
    logger.error(`[Guidr] ${label} listener error:`, err);
  };
}

/* ── Global aggregate counters (stats/global) ── */
export interface GlobalStats {
  totalCases: number;
  reportedNSRC: number;
  totalUsers: number;
}

const globalStatsRef = () => doc(db, "stats", "global");

export function subscribeGlobalStats(callback: (stats: GlobalStats) => void): Unsubscribe {
  return onSnapshot(
    globalStatsRef(),
    (snap) => {
      const d = snap.exists() ? snap.data() : {};
      callback({
        totalCases: d.totalCases || 0,
        reportedNSRC: d.reportedNSRC || 0,
        totalUsers: d.totalUsers || 0,
      });
    },
    handleListenerError("global_stats")
  );
}

/* ── Guardian links (guardians only; drives WardOverview) ── */
export interface GuardianLink {
  id?: string;
  wardUid: string;
  wardName: string;
  guardianUid: string;
  guardianPhone?: string;
  guardianName?: string;
  status: "invited" | "pending" | "active" | "declined";
  createdAt?: Timestamp;
  inviteToken?: string;
}

export function subscribeIncomingGuardianRequests(
  guardianUid: string,
  callback: (links: GuardianLink[]) => void
): Unsubscribe {
  const q = query(collection(db, "guardian_links"), where("guardianUid", "==", guardianUid));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GuardianLink))),
    handleListenerError("guardian_links")
  );
}

/* ── Guardian events (per guardian; server-written) ── */
export interface GuardianEvent {
  id?: string;
  wardUid: string;
  wardName: string;
  verdict: "SCAM" | "SUSPICIOUS";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  scamType: string;
  at: number;
  read: boolean;
}

export function subscribeGuardianEvents(
  guardianUid: string,
  callback: (events: GuardianEvent[]) => void,
  max = 20
): Unsubscribe {
  const q = query(
    collection(db, "users", guardianUid, "guardian_events"),
    orderBy("at", "desc"),
    limit(max)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GuardianEvent))),
    handleListenerError("guardian_events")
  );
}
```

## 9. `app/globals.css` (verbatim — the design system; reproduce exactly)
```css
@import "tailwindcss";

:root {
  --background: #edf1f3;
  --foreground: #1a1a2e;
}

@theme {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-guidr-primary: #0d7377;
  --color-guidr-primary-dark: #095456;
  --color-guidr-primary-light: #e0f2f2;
  --color-guidr-bg: #edf1f3;
  --color-guidr-card: #ffffff;
  --color-guidr-red: #e05252;
  --color-guidr-red-light: #fde8e8;
  --color-guidr-blue: #3b82f6;
  --color-guidr-blue-light: #dbeafe;
  --color-guidr-green: #22c55e;
  --color-guidr-green-light: #dcfce7;
  --color-guidr-amber: #f5b731;
  --color-guidr-text: #1a1a2e;
  --color-guidr-muted: #7b8794;
  --font-sans: var(--font-inter);
}

.dark {
  --background: #0f172a;
  --foreground: #f1f5f9;
  --color-guidr-bg: #0f172a;
  --color-guidr-card: #1e293b;
  --color-guidr-text: #f1f5f9;
  --color-guidr-muted: #94a3b8;
  --color-guidr-primary-light: #134e4a;
  --color-guidr-red-light: #7f1d1d;
  --color-guidr-blue-light: #1e3a8a;
  --color-guidr-green-light: #14532d;
}

html.dark .text-guidr-text { color: #f1f5f9; }
html.dark .text-guidr-muted { color: #94a3b8; }
html.dark .bg-guidr-bg { background-color: #0f172a; }
html.dark .bg-guidr-card { background-color: #1e293b; }
html.dark .bg-guidr-primary-light { background-color: #134e4a; }
html.dark .border-guidr-primary-light { border-color: #134e4a; }

html.dark .text-guidr-primary { color: #5eead4; }
html.dark .text-guidr-primary-dark { color: #2dd4bf; }
html.dark .border-guidr-primary { border-color: #2dd4bf; }
html.dark .bg-guidr-red-light { background-color: rgba(127, 29, 29, 0.35); }
html.dark .bg-guidr-blue-light { background-color: rgba(30, 58, 138, 0.35); }
html.dark .bg-guidr-green-light { background-color: rgba(20, 83, 45, 0.35); }
html.dark .guidr-container { background-color: #0f172a; }

html.dark .bg-white { background-color: #1e293b; }
html.dark .bg-white\/70 { background-color: rgba(30, 41, 59, 0.7); }
html.dark .bg-white\/80 { background-color: rgba(30, 41, 59, 0.8); }
html.dark .bg-white\/90 { background-color: rgba(30, 41, 59, 0.9); }
html.dark .bg-white\/95 { background-color: rgba(30, 41, 59, 0.95); }
html.dark .bg-gray-50 { background-color: #334155; }
html.dark .bg-gray-100 { background-color: #475569; }
html.dark .bg-gray-200 { background-color: #475569; }

html.dark .ring-gray-100 { --tw-ring-color: #334155; }

html.dark .border-gray-100 { border-color: #334155; }
html.dark .border-gray-200 { border-color: #475569; }
html.dark .border-gray-300 { border-color: #64748b; }

html.dark .hover\:bg-gray-50:hover { background-color: #334155; }
html.dark .hover\:bg-gray-100:hover { background-color: #475569; }

html.dark .text-gray-400 { color: #cbd5e1; }
html.dark .text-gray-500 { color: #cbd5e1; }
html.dark .text-gray-600 { color: #e2e8f0; }
html.dark .text-gray-700 { color: #f1f5f9; }
html.dark .text-gray-800 { color: #f1f5f9; }
html.dark .text-gray-900 { color: #f1f5f9; }

html.dark .bg-red-50 { background-color: rgba(127, 29, 29, 0.25); }
html.dark .bg-red-100 { background-color: rgba(127, 29, 29, 0.35); }
html.dark .bg-red-200 { background-color: rgba(127, 29, 29, 0.45); }
html.dark .bg-red-300 { background-color: rgba(153, 27, 27, 0.55); }
html.dark .border-red-100 { border-color: rgba(220, 38, 38, 0.4); }
html.dark .border-red-200 { border-color: rgba(220, 38, 38, 0.5); }
html.dark .border-red-300 { border-color: rgba(248, 113, 113, 0.5); }
html.dark .border-l-red-500 { border-left-color: #ef4444; }
html.dark .text-red-500 { color: #fca5a5; }
html.dark .text-red-600 { color: #fca5a5; }
html.dark .text-red-700 { color: #fecaca; }
html.dark .text-red-800 { color: #fecaca; }
html.dark .text-red-900 { color: #fee2e2; }

html.dark .bg-green-50 { background-color: rgba(20, 83, 45, 0.25); }
html.dark .bg-green-100 { background-color: rgba(20, 83, 45, 0.35); }
html.dark .bg-green-200 { background-color: rgba(20, 83, 45, 0.45); }
html.dark .border-green-100 { border-color: rgba(34, 197, 94, 0.4); }
html.dark .border-green-200 { border-color: rgba(34, 197, 94, 0.5); }
html.dark .border-l-green-500 { border-left-color: #22c55e; }
html.dark .text-green-500 { color: #86efac; }
html.dark .text-green-600 { color: #86efac; }
html.dark .text-green-700 { color: #bbf7d0; }
html.dark .text-green-800 { color: #bbf7d0; }
html.dark .text-green-900 { color: #dcfce7; }

html.dark .bg-blue-50 { background-color: rgba(30, 58, 138, 0.25); }
html.dark .bg-blue-100 { background-color: rgba(30, 58, 138, 0.35); }
html.dark .border-blue-100 { border-color: rgba(59, 130, 246, 0.4); }
html.dark .border-blue-200 { border-color: rgba(59, 130, 246, 0.5); }
html.dark .text-blue-500 { color: #93c5fd; }
html.dark .text-blue-600 { color: #93c5fd; }
html.dark .text-blue-700 { color: #bfdbfe; }
html.dark .text-blue-800 { color: #bfdbfe; }

html.dark .bg-amber-50 { background-color: rgba(120, 53, 15, 0.25); }
html.dark .bg-amber-100 { background-color: rgba(120, 53, 15, 0.35); }
html.dark .bg-amber-200 { background-color: rgba(120, 53, 15, 0.45); }
html.dark .border-amber-100 { border-color: rgba(245, 158, 11, 0.4); }
html.dark .border-amber-200 { border-color: rgba(245, 158, 11, 0.5); }
html.dark .border-l-amber-500 { border-left-color: #f59e0b; }
html.dark .text-amber-500 { color: #fcd34d; }
html.dark .text-amber-600 { color: #fcd34d; }
html.dark .text-amber-700 { color: #fde68a; }
html.dark .text-amber-800 { color: #fde68a; }
html.dark .text-amber-900 { color: #fef3c7; }

html.dark .bg-orange-50 { background-color: rgba(124, 45, 18, 0.25); }
html.dark .bg-orange-100 { background-color: rgba(124, 45, 18, 0.35); }
html.dark .text-orange-600 { color: #fdba74; }
html.dark .text-orange-700 { color: #fed7aa; }
html.dark .text-orange-800 { color: #fed7aa; }

body {
  background: var(--background);
  color: var(--foreground);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── Responsive Container ── */
.guidr-container {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  background-color: var(--color-guidr-bg);
}

@media (min-width: 640px) {
  .guidr-container {
    max-width: 32rem;
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  }
}

@media (min-width: 1024px) {
  .guidr-container {
    max-width: none;
    width: 100%;
    margin-left: 0;
    margin-right: 0;
    padding-left: 15rem;
    box-shadow: none;
    border: none;
  }

  .guidr-container > main {
    width: 100%;
    max-width: 72rem;
    margin-left: auto;
    margin-right: auto;
    padding-left: 2rem;
    padding-right: 2rem;
  }

  .guidr-container.no-sidebar {
    padding-left: 0;
    max-width: 28rem;
    margin-left: auto;
    margin-right: auto;
  }

  .pb-safe {
    padding-bottom: 2.5rem;
  }
}

/* ── Loading Screen (splash) ── */
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  opacity: 1;
  transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: opacity;
}
.loading-overlay.fade-out {
  opacity: 0;
  pointer-events: none;
}
.loading-overlay img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
html.guidr-skip-splash .loading-overlay {
  display: none;
}

/* ── Animations ── */
@keyframes guidr-fade-in-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes guidr-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes guidr-scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.guidr-animate-in {
  opacity: 0;
  animation: guidr-fade-in-up 0.5s ease-out forwards;
}

@media (prefers-reduced-motion: reduce) {
  .guidr-animate-in {
    opacity: 1;
    animation: none;
  }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

.guidr-stagger-1 { animation-delay: 0.05s; }
.guidr-stagger-2 { animation-delay: 0.1s; }
.guidr-stagger-3 { animation-delay: 0.15s; }
.guidr-stagger-4 { animation-delay: 0.2s; }
.guidr-stagger-5 { animation-delay: 0.25s; }
.guidr-stagger-6 { animation-delay: 0.3s; }
.guidr-stagger-7 { animation-delay: 0.35s; }

/* ── Scrollbar Hide ── */
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* ── Safe areas ── */
.pb-safe {
  padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
}
.pb-nav-safe {
  padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
}
.pt-safe-top {
  padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
}
.pb-safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```
> Source `globals.css` also has react-phone-number-input overrides and a pulse-ring
> keyframe — unused by these two pages, safe to omit.

## 10. Contexts

### 10.1 `app/context/UserContext.tsx` (minimal — presence/session tracking removed)
```tsx
"use client";

import { logger } from "@/lib/logger";
import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter, usePathname } from "next/navigation";
import { auth, db } from "@/lib/firebase";

export interface UserProfile {
  uid: string;
  fullName: string;
  username: string;
  email: string | null;
  photoURL?: string | null;
}

interface UserContextType {
  user: UserProfile | null;
  loading: boolean;
}

const UserContext = createContext<UserContextType>({ user: null, loading: true });

/** Routes viewable without an account (no redirect / no skeleton). */
function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/ms" ||
    pathname === "/login" ||
    pathname === "/onboarding" ||
    pathname.startsWith("/alert") ||
    pathname.startsWith("/guardian/invite")
  );
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Render immediately from what auth knows, then enrich from Firestore.
        setUser({
          uid: firebaseUser.uid,
          fullName: firebaseUser.displayName || "User",
          username: "user",
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL || null,
        });
        setLoading(false);

        try {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUser({
              uid: firebaseUser.uid,
              fullName: data.fullName || firebaseUser.displayName || "User",
              username: data.username || "user",
              email: firebaseUser.email,
              photoURL: data.photoURL || firebaseUser.photoURL || null,
            });
          }
        } catch (error) {
          logger.error("Error fetching user profile:", error);
        }
      } else {
        setUser(null);
        if (!isPublicPath(pathname)) {
          let onboarded = false;
          try {
            onboarded = localStorage.getItem("guidr_onboarded") === "1";
          } catch {
            /* storage disabled — treat as not yet onboarded */
          }
          router.push(onboarded ? "/login" : "/onboarding");
        }
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [pathname, router]);

  // Loading skeleton that mimics the app chrome on protected routes.
  if (loading && !isPublicPath(pathname)) {
    return (
      <div className="min-h-dvh bg-guidr-bg flex flex-col">
        <div className="sticky top-0 flex items-center justify-between px-5 pt-safe-top pb-3 bg-white/90 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl animate-pulse bg-gray-200" />
          <div className="h-6 w-24 rounded animate-pulse bg-gray-200" />
          <div className="w-10 h-10 rounded-full animate-pulse bg-gray-200" />
        </div>
        <div className="flex-1 px-5 py-4 flex flex-col gap-3">
          <div className="h-32 rounded-2xl animate-pulse bg-gray-200" />
          <div className="h-20 rounded-2xl animate-pulse bg-gray-200" />
          <div className="h-20 rounded-2xl animate-pulse bg-gray-200" />
          <div className="h-20 rounded-2xl animate-pulse bg-gray-200" />
        </div>
        <div className="lg:hidden h-16 border-t border-gray-100 bg-white flex items-center justify-around px-5 pb-safe-bottom">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 rounded animate-pulse bg-gray-200" />
              <div className="w-10 h-2 rounded animate-pulse bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <UserContext.Provider value={{ user, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
```
> The full app's UserContext also does presence heartbeats + device-session
> tracking (Firestore writes). Those are invisible plumbing and were removed here.

### 10.2 `app/context/PrefsContext.tsx` (verbatim)
```tsx
"use client";

import { logger } from "@/lib/logger";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "./UserContext";
import { t, type Locale } from "@/lib/i18n";

type ThemePref = "light" | "dark" | "system";

interface PrefsContextType {
  theme: ThemePref;
  locale: Locale;
  defaultScanChannel: string | null;
  tr: (key: string, params?: Record<string, string>) => string;
}

const PrefsContext = createContext<PrefsContextType>({
  theme: "light",
  locale: "en",
  defaultScanChannel: null,
  tr: (key) => key,
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [theme, setTheme] = useState<ThemePref>("light");
  const [locale, setLocale] = useState<Locale>("en");
  const [defaultScanChannel, setDefaultScanChannel] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.theme === "dark" || data.theme === "light" || data.theme === "system") {
            setTheme(data.theme);
          }
          if (data.language === "en" || data.language === "ms" || data.language === "zh") {
            setLocale(data.language as Locale);
          }
          setDefaultScanChannel(
            typeof data.defaultScanChannel === "string" ? data.defaultScanChannel : "WhatsApp"
          );
        }
      },
      (err) => {
        if (err.code !== "permission-denied") {
          logger.error("[Guidr Prefs] subscription error:", err);
        }
      }
    );
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const html = document.documentElement;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && !!mq?.matches);
      html.classList.toggle("dark", isDark);
    };
    apply();
    if (theme === "system" && mq) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  function tr(key: string, params?: Record<string, string>): string {
    return t(locale, key, params);
  }

  return (
    <PrefsContext.Provider value={{ theme, locale, defaultScanChannel, tr }}>
      {children}
    </PrefsContext.Provider>
  );
}

export function usePrefs() {
  return useContext(PrefsContext);
}
```

## 11. App shell

### 11.1 `app/layout.tsx` (verbatim)
```tsx
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
  metadataBase: new URL("https://guidr.my"),
  title: {
    default: "Guidr — Security Made Simple",
    template: "%s — Guidr",
  },
  description:
    "Investigate suspicious messages, detect scams, and protect yourself from online fraud with Guidr.",
  applicationName: "Guidr",
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
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
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
```

### 11.2 `app/components/ClientProviders.tsx` (minimal — plumbing/chrome removed)
```tsx
"use client";

import { ReactNode } from "react";
import { UserProvider } from "@/app/context/UserContext";
import { PrefsProvider } from "@/app/context/PrefsContext";

/**
 * Minimal provider tree for the Home + Analytics port. The full app also mounts
 * ToastProvider, the service worker, push, app-lock, install-prompt and the
 * splash LoadingScreen here — all out of scope and omitted.
 */
export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <UserProvider>
      <PrefsProvider>{children}</PrefsProvider>
    </UserProvider>
  );
}
```

### 11.3 `app/components/NotificationsBell.tsx` (minimal — static bell)
```tsx
"use client";

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7b8794" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

/**
 * Minimal visual stand-in for the full app's live notifications dropdown, so the
 * header and sidebar look complete. No data / no dropdown.
 */
export default function NotificationsBell({ placement = "header" }: { placement?: "header" | "sidebar" }) {
  if (placement === "sidebar") {
    return (
      <button
        type="button"
        aria-label="Notifications"
        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors w-full"
      >
        <BellIcon />
        <span className="text-sm font-medium text-guidr-muted">Notifications</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label="Notifications"
      className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
    >
      <BellIcon />
    </button>
  );
}
```

## 12. Navigation chrome

### 12.1 `app/components/Header.tsx` (verbatim)
```tsx
import Image from "next/image";
import NotificationsBell from "@/app/components/NotificationsBell";

export default function Header() {
  return (
    <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between gap-3 px-4 pb-3 pt-safe-top bg-white/90 backdrop-blur-md border-b border-gray-100">
      <Image
        src="/images/Brand Logo.png"
        alt="Guidr"
        width={400}
        height={100}
        className="h-7 w-auto"
        priority
      />

      <NotificationsBell placement="header" />
    </header>
  );
}
```

### 12.2 `app/components/BottomNav.tsx` (verbatim)
```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { usePrefs } from "@/app/context/PrefsContext";
import { useUser } from "@/app/context/UserContext";
import NotificationsBell from "@/app/components/NotificationsBell";

export default function BottomNav() {
  const pathname = usePathname();
  const { tr } = usePrefs();
  const { user } = useUser();

  const navItems = [
    {
      href: "/",
      label: tr("nav.home"),
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "#0d7377" : "none"} stroke={active ? "#0d7377" : "#7b8794"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      href: "/analytics",
      label: tr("nav.analytics"),
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#0d7377" : "#7b8794"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      href: "/scan",
      label: tr("nav.scan"),
      isBrandIcon: true,
      icon: () => null,
    },
    {
      href: "/learn",
      label: tr("nav.learn"),
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "#0d7377" : "none"} stroke={active ? "#0d7377" : "#7b8794"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
    {
      href: "/profile",
      label: tr("nav.profile"),
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "#0d7377" : "none"} stroke={active ? "#0d7377" : "#7b8794"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* MOBILE / TABLET — bottom navigation bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-[0_-2px_20px_rgba(0,0,0,0.04)]">
        <div className="max-w-md mx-auto flex items-end px-2 pt-2 pb-nav-safe">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            if (item.isBrandIcon) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-1 flex-col items-center -mt-5 pb-1 group"
                  aria-label={item.label}
                >
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg overflow-hidden transition-transform group-hover:scale-105 group-active:scale-95 ${isActive
                      ? "bg-guidr-primary ring-4 ring-guidr-primary/20"
                      : "bg-white ring-2 ring-gray-100"
                    }`}>
                    <Image
                      src="/images/Brand Icon.png"
                      alt="Scan"
                      width={40}
                      height={40}
                      className="object-contain scale-[1.8]"
                    />
                  </div>
                  <span className={`text-[10px] mt-1 font-medium ${isActive ? "text-guidr-primary" : "text-guidr-muted"
                    }`}>
                    {item.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-1 flex-col items-center gap-0.5 py-1 group"
                aria-label={item.label}
              >
                <div className="transition-transform group-hover:scale-110 group-active:scale-95">
                  {item.icon(isActive)}
                </div>
                <span className={`text-[10px] font-medium ${isActive ? "text-guidr-primary" : "text-guidr-muted"
                  }`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* DESKTOP — fixed left sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 z-40 h-screen w-60 flex-col bg-white border-r border-gray-100 shadow-[2px_0_20px_rgba(0,0,0,0.03)]">
        <Link href="/" className="flex items-center gap-2 px-5 h-20 shrink-0 border-b border-gray-100">
          <div className="w-10 h-10 relative overflow-hidden shrink-0">
            <Image
              src="/images/Brand Icon.png"
              alt="Guidr"
              fill
              className="object-contain scale-[1.7]"
              sizes="40px"
            />
          </div>
          <Image
            src="/images/Brand Logo.png"
            alt="Guidr"
            width={400}
            height={100}
            className="h-8 w-auto"
            priority
          />
        </Link>

        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-5 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            if (item.isBrandIcon) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 my-2 rounded-xl font-semibold transition-all active:scale-[0.98] ${isActive
                      ? "bg-guidr-primary text-white shadow-lg shadow-guidr-primary/20"
                      : "bg-guidr-primary-dark text-white hover:bg-guidr-primary shadow-md shadow-guidr-primary/10"
                    }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  {item.label}
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${isActive
                    ? "bg-guidr-primary-light text-guidr-primary"
                    : "text-guidr-muted hover:bg-gray-50 hover:text-guidr-text"
                  }`}
              >
                {item.icon(isActive)}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-gray-100 shrink-0 flex flex-col gap-1">
          <NotificationsBell placement="sidebar" />

          <Link
            href="/profile"
            className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${pathname === "/profile" ? "bg-guidr-primary-light" : "hover:bg-gray-50"
              }`}
          >
            <div className="shrink-0 w-9 h-9 rounded-full bg-guidr-primary-light flex items-center justify-center overflow-hidden border border-gray-100">
              {user?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt={user.fullName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-guidr-primary">
                  {user?.fullName?.charAt(0).toUpperCase() || "U"}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-guidr-text truncate">{user?.fullName || "Guest"}</p>
              <p className="text-xs text-guidr-muted truncate">@{user?.username || "user"}</p>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
}
```

## 13. Shared UI components (verbatim)

### 13.1 `app/components/Skeleton.tsx`
```tsx
export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-gray-200 ${className}`}
    />
  );
}
```

### 13.2 `app/components/ScamCategoryIcon.tsx`
```tsx
import { normalizeScamType } from "@/lib/scam-categories";

export const CATEGORY_COLORS: Record<string, { text: string; bg: string }> = {
  "Phishing":             { text: "text-red-600",     bg: "bg-red-50" },
  "Impersonation":        { text: "text-rose-600",    bg: "bg-rose-50" },
  "Investment Scam":      { text: "text-blue-600",    bg: "bg-blue-50" },
  "Crypto Scam":          { text: "text-amber-600",   bg: "bg-amber-50" },
  "Job Scam":             { text: "text-orange-600",  bg: "bg-orange-50" },
  "Loan Scam":            { text: "text-emerald-600", bg: "bg-emerald-50" },
  "Romance Scam":         { text: "text-pink-600",    bg: "bg-pink-50" },
  "Lottery Scam":         { text: "text-purple-600",  bg: "bg-purple-50" },
  "Online Shopping Scam": { text: "text-indigo-600",  bg: "bg-indigo-50" },
  "Tech Support Scam":    { text: "text-slate-600",   bg: "bg-slate-100" },
  "Delivery Scam":        { text: "text-orange-700",  bg: "bg-orange-50" },
  "Charity Scam":         { text: "text-teal-600",    bg: "bg-teal-50" },
  "Other":                { text: "text-gray-500",    bg: "bg-gray-100" },
  "None":                 { text: "text-green-600",   bg: "bg-green-50" },
};

const FALLBACK = { text: "text-gray-500", bg: "bg-gray-100" };

export function categoryColor(scamType: string | undefined | null) {
  return CATEGORY_COLORS[normalizeScamType(scamType)] || FALLBACK;
}

export function categoryName(scamType: string | undefined | null): string {
  return normalizeScamType(scamType);
}

export function displayCategoryName(
  scamType: string | undefined | null,
  verdict?: string | null
): string {
  const canonical = normalizeScamType(scamType);
  if (verdict === "LIKELY_SAFE" || canonical === "None") return "No threat detected";
  if (canonical === "Other") return "Other scam";
  return canonical;
}

function Glyph({ category }: { category: string }) {
  switch (category) {
    case "Phishing":
      return (<><path d="M22 6 12 13 2 6" /><rect x="2" y="4" width="20" height="16" rx="2" /></>);
    case "Impersonation":
      return (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" y1="8" x2="22" y2="13" /><line x1="22" y1="8" x2="17" y2="13" /></>);
    case "Investment Scam":
      return (<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>);
    case "Crypto Scam":
      return (<><circle cx="12" cy="12" r="9" /><path d="M9.5 8.5h3.5a2 2 0 0 1 0 4H9.5m0 0h4a2 2 0 0 1 0 4H9.5m0-8v10m1.5-10V6.5m0 11V15.5" /></>);
    case "Job Scam":
      return (<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>);
    case "Loan Scam":
      return (<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>);
    case "Romance Scam":
      return (<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" />);
    case "Lottery Scam":
      return (<><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></>);
    case "Online Shopping Scam":
      return (<><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>);
    case "Tech Support Scam":
      return (<><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>);
    case "Delivery Scam":
      return (<><path d="M16 3h1.5L21 8v8h-2" /><path d="M3 6h13v10H3z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>);
    case "Charity Scam":
      return (<><path d="M19 14c1.49-1.46 3-3.21 3-5.5A3.5 3.5 0 0 0 12 6a3.5 3.5 0 0 0-7 2.5c0 2.29 1.51 4.04 3 5.5" /><path d="M5 14l3.5 4 2-2 2 2 3.5-4" /></>);
    case "None":
      return (<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>);
    case "Other":
    default:
      return (<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>);
  }
}

interface Props {
  scamType: string | undefined | null;
  size?: number;
  className?: string;
}

export default function ScamCategoryIcon({ scamType, size = 20, className = "" }: Props) {
  const category = normalizeScamType(scamType);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <Glyph category={category} />
    </svg>
  );
}
```

### 13.3 `app/components/EmailComposerModal.tsx`
```tsx
"use client";

import { useState } from "react";

interface EmailComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  to: string;
  subject: string;
  body?: string;
  title?: string;
  description?: string;
}

type Provider = "gmail" | "outlook" | "yahoo" | "default" | "copy";

interface ProviderOption {
  id: Provider;
  name: string;
  caption: string;
  icon: React.ReactNode;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "gmail",
    name: "Gmail",
    caption: "Opens Gmail web compose in a new tab",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M22 6.5V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6.5l10 6.5 10-6.5z" fill="#EA4335" />
        <path d="M2 6.5V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v.5l-10 6.5L2 6.5z" fill="#fff" stroke="#EA4335" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: "outlook",
    name: "Outlook",
    caption: "Opens Outlook web compose in a new tab",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="4" width="20" height="16" rx="2" fill="#0078D4" />
        <text x="12" y="16.5" fontSize="11" fontWeight="700" fill="white" textAnchor="middle" fontFamily="Arial, sans-serif">O</text>
      </svg>
    ),
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    caption: "Opens Yahoo Mail compose in a new tab",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="4" width="20" height="16" rx="2" fill="#6001D2" />
        <text x="12" y="16.5" fontSize="11" fontWeight="700" fill="white" textAnchor="middle" fontFamily="Arial, sans-serif">Y!</text>
      </svg>
    ),
  },
  {
    id: "default",
    name: "Default mail app",
    caption: "Uses whatever your device opens for mailto: links",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    id: "copy",
    name: "Copy to clipboard",
    caption: "Copy the email body to paste anywhere you want",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    ),
  },
];

function buildProviderUrl(provider: Provider, to: string, subject: string, body: string): string | null {
  const t = encodeURIComponent(to);
  const s = encodeURIComponent(subject);
  const b = encodeURIComponent(body);

  switch (provider) {
    case "gmail":
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${t}&su=${s}&body=${b}`;
    case "outlook":
      return `https://outlook.live.com/mail/0/deeplink/compose?to=${t}&subject=${s}&body=${b}`;
    case "yahoo":
      return `https://compose.mail.yahoo.com/?to=${t}&subject=${s}&body=${b}`;
    case "default":
      return `mailto:${to}?subject=${s}&body=${b}`;
    case "copy":
      return null;
  }
}

export default function EmailComposerModal({
  isOpen,
  onClose,
  to,
  subject,
  body = "",
  title = "Send email",
  description,
}: EmailComposerModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  async function handlePick(provider: Provider) {
    if (provider === "copy") {
      const text = `To: ${to}\nSubject: ${subject}\n\n${body}`;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
          onClose();
        }, 1200);
      } catch {
        window.prompt("Copy the email below:", text);
        onClose();
      }
      return;
    }

    const url = buildProviderUrl(provider, to, subject, body);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[guidr-fade-in_0.2s_ease-out]"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-md mx-auto bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-[guidr-scale-in_0.25s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-bold text-guidr-text">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7b8794" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-guidr-muted">
            {description ?? <>Choose how you&apos;d like to send this email to <span className="font-medium text-guidr-text">{to}</span>.</>}
          </p>
        </div>

        <div className="mx-6 border-t border-gray-100" />

        <div className="px-6 py-4 flex flex-col gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePick(p.id)}
              className="w-full flex items-start gap-3 p-3.5 rounded-xl text-left bg-gray-50 border-2 border-transparent hover:bg-gray-100 hover:border-guidr-primary/20 transition-all duration-200"
            >
              <div className="shrink-0 mt-0.5">{p.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-guidr-text">{p.name}</p>
                <p className="text-xs text-guidr-muted mt-0.5 leading-relaxed">
                  {p.id === "copy" && copied ? "Copied to clipboard ✓" : p.caption}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7b8794" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>

        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-6 rounded-xl bg-white border border-gray-200 text-sm font-medium text-guidr-muted hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

## 14. Home page components (verbatim)

### 14.1 `app/components/LandingGate.tsx`
```tsx
"use client";

import { ReactNode } from "react";
import { useUser } from "@/app/context/UserContext";

export default function LandingGate({
  marketing,
  app,
}: {
  marketing: ReactNode;
  app: ReactNode;
}) {
  const { user } = useUser();
  return <>{user ? app : marketing}</>;
}
```

### 14.2 `app/components/GetStartedButton.tsx`
```tsx
"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";

export default function GetStartedButton({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const handleClick = () => {
    let onboarded = false;
    try {
      onboarded = localStorage.getItem("guidr_onboarded") === "1";
    } catch {
      /* storage disabled — treat as not yet onboarded */
    }
    router.push(onboarded ? "/login" : "/onboarding");
  };

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
```

### 14.3 `app/components/HeroSection.tsx`
```tsx
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
```

### 14.4 `app/components/StatsCards.tsx`
```tsx
"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeGlobalStats } from "@/lib/firestore";
import Skeleton from "@/app/components/Skeleton";
import ScamCategoryIcon, { categoryColor, displayCategoryName } from "@/app/components/ScamCategoryIcon";

const medalColors = [
  { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300", ring: "ring-amber-200" },
  { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-300", ring: "ring-gray-200" },
  { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300", ring: "ring-orange-200" },
];

interface Scam {
  id: string;
  name: string;
  cases: number;
}

export default function StatsCards() {
  const [trendingScams, setTrendingScams] = useState<Scam[]>([]);
  const [totalCasesFiled, setTotalCasesFiled] = useState<number>(0);
  const [reportedToNSRC, setReportedToNSRC] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState<number>(0);

  useEffect(() => {
    const scamsQuery = query(collection(db, "scams"), orderBy("cases", "desc"), limit(3));
    const unsubscribeScams = onSnapshot(scamsQuery, (snapshot) => {
      const scamsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name || "Unknown Scam",
        cases: doc.data().cases || 0,
      }));
      setTrendingScams(scamsData);
    }, (error) => logger.error("Error fetching scams:", error));

    const unsubscribeStats = subscribeGlobalStats((stats) => {
      setTotalCasesFiled(stats.totalCases);
      setReportedToNSRC(stats.reportedNSRC);
      setTotalUsers(stats.totalUsers);
      setLoading(false);
    });

    return () => {
      unsubscribeScams();
      unsubscribeStats();
    };
  }, []);

  return (
    <section className="px-5 py-4 lg:px-0 lg:py-6">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5 lg:items-start">

      <div className="order-2 lg:order-1 lg:col-span-1">
      <div className="guidr-animate-in guidr-stagger-3 bg-white rounded-2xl border-l-4 border-l-guidr-red shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
          <div className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-guidr-red-light">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e05252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </div>
          <div>
            <p className="text-base font-bold text-guidr-text leading-tight">Top Trending Scams</p>
            <p className="text-xs text-guidr-muted">Across all Guidr users</p>
          </div>
        </div>

        <div className="px-4 pb-4 pt-1 flex flex-col gap-2">
          {loading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/40">
                  <Skeleton className="w-7 h-7 rounded-full" />
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </>
          ) : trendingScams.length > 0 ? (
            (() => {
              const trendingTotal = trendingScams.reduce((sum, s) => sum + s.cases, 0);
              return trendingScams.map((scam, i) => {
                const share = trendingTotal > 0 ? Math.round((scam.cases / trendingTotal) * 100) : 0;
                return (
              <div
                key={scam.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${medalColors[i]?.border || "border-gray-200"} ${medalColors[i]?.bg || "bg-gray-50"}/40`}
              >
                <div className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full font-bold text-sm ${medalColors[i]?.bg || "bg-gray-100"} ${medalColors[i]?.text || "text-gray-500"} ring-1 ${medalColors[i]?.ring || "ring-gray-200"}`}>
                  {i + 1}
                </div>

                <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${categoryColor(scam.name).bg}`}>
                  <ScamCategoryIcon scamType={scam.name} size={16} className={categoryColor(scam.name).text} />
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-guidr-text truncate">{displayCategoryName(scam.name)}</p>
                  <p className="text-xs text-guidr-muted">{scam.cases.toLocaleString()} cases</p>
                </div>

                <span className="shrink-0 text-xs font-semibold text-guidr-red flex items-center gap-0.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                  {share}%
                </span>
              </div>
                );
              });
            })()
          ) : (
            <p className="text-sm text-guidr-muted text-center py-2">No data yet.</p>
          )}
        </div>
      </div>
      </div>

      <div className="order-1 lg:order-2 lg:col-span-2 grid grid-cols-3 gap-3 lg:gap-4">

      <div className="guidr-animate-in guidr-stagger-4 flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-2xl font-bold text-guidr-text leading-none">
            {totalCasesFiled.toLocaleString()}
          </p>
        )}
        <p className="text-xs text-guidr-muted mt-1.5">Cases filed</p>
      </div>

      <div className="guidr-animate-in guidr-stagger-5 flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-2xl font-bold text-guidr-text leading-none">
            {reportedToNSRC.toLocaleString()}
          </p>
        )}
        <p className="text-xs text-guidr-muted mt-1.5">To NSRC</p>
      </div>

      <div className="guidr-animate-in guidr-stagger-6 flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-2xl font-bold text-guidr-text leading-none">
            {totalUsers.toLocaleString()}
          </p>
        )}
        <p className="text-xs text-guidr-muted mt-1.5">Users</p>
      </div>

      </div>
      </div>
    </section>
  );
}
```

### 14.5 `app/components/HowItWorks.tsx`
```tsx
const steps = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
    label: "Scan",
    bgStyle: "bg-guidr-primary-light border-2 border-guidr-primary/20",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    label: "Investigate",
    bgStyle: "bg-guidr-primary",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
    label: "Report",
    bgStyle: "bg-guidr-primary-light border-2 border-guidr-primary/20",
  },
];

export default function HowItWorks() {
  return (
    <section className="px-5 py-6 lg:px-0 lg:py-8 guidr-animate-in guidr-stagger-6">
      <h3 className="text-lg font-bold text-guidr-text text-center mb-4">
        How it works
      </h3>

      <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-0 lg:max-w-lg lg:mx-auto">
        {steps.map((step, i) => (
          <div key={step.label}>
            <div className="flex items-center gap-4">
              <div
                className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-full ${step.bgStyle}`}
              >
                {step.icon}
              </div>

              <span className="text-base font-semibold text-guidr-text">
                {step.label}
              </span>
            </div>

            {i < steps.length - 1 && (
              <div className="flex flex-col items-center w-11 py-1">
                <div className="w-0.5 h-4 bg-guidr-primary/30 rounded-full" />
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="-mt-1 opacity-60">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
```

### 14.6 `app/components/MarketingLanding.tsx` (verbatim — signed-out `/`)
```tsx
import Image from "next/image";
import Link from "next/link";
import GetStartedButton from "@/app/components/GetStartedButton";

type LandingLocale = "en" | "ms";

const SITE_URL = "https://guidr.my";

const copy = {
  en: {
    signIn: "Sign in",
    langSwitch: { href: "/ms", label: "Bahasa Melayu" },
    badge: "Recognised by NSRC Malaysia",
    h1: "Check if a message is real — or a scam",
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
    badge: "Diiktiraf oleh NSRC Malaysia",
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
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-guidr-primary bg-guidr-primary-light rounded-full px-3 py-1.5 mb-5">
            <FeatureIcon name="shield" />
            {t.badge}
          </p>
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
```

### 14.7 `app/page.tsx` (verbatim — Home)
```tsx
import type { Metadata } from "next";
import Header from "@/app/components/Header";
import HeroSection from "@/app/components/HeroSection";
import StatsCards from "@/app/components/StatsCards";
import HowItWorks from "@/app/components/HowItWorks";
import BottomNav from "@/app/components/BottomNav";
import LandingGate from "@/app/components/LandingGate";
import MarketingLanding from "@/app/components/MarketingLanding";

export const metadata: Metadata = {
  title: { absolute: "Guidr — Check Suspicious Messages, Links & Scams in Malaysia" },
  description:
    "Free AI scam checker for Malaysia. Paste a suspicious SMS, WhatsApp message, link or phone number and get a clear answer in seconds. Recognised by NSRC Malaysia.",
  alternates: {
    canonical: "/",
    languages: { en: "/", ms: "/ms", "x-default": "/" },
  },
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
```

## 15. Analytics page components (verbatim)

### 15.1 `app/components/ActivityTrend.tsx`
```tsx
"use client";

import { useMemo, useState } from "react";

interface TrendCase {
  verdict: string;
  date: Date | null;
}

export type TrendRange = "Week" | "Month" | "Year";

interface Bucket {
  label: string;
  full: string;
  count: number;
}

const DAY_MS = 86_400_000;
const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildBuckets(cases: TrendCase[], range: TrendRange, now: number): Bucket[] {
  const risky = cases.filter((c) => c.verdict !== "LIKELY_SAFE" && c.date);

  if (range === "Year") {
    const buckets: Bucket[] = [];
    const ref = new Date(now);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
      const count = risky.filter(
        (c) => c.date!.getFullYear() === d.getFullYear() && c.date!.getMonth() === d.getMonth()
      ).length;
      buckets.push({
        label: i === 11 || d.getMonth() % 3 === 0 ? MONTH_SHORT[d.getMonth()] : "",
        full: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`,
        count,
      });
    }
    return buckets;
  }

  const days = range === "Week" ? 7 : 30;
  const per = range === "Week" ? 1 : 5;
  const n = days / per;
  const buckets: Bucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = now - i * per * DAY_MS;
    const start = end - per * DAY_MS;
    const count = risky.filter((c) => {
      const t = c.date!.getTime();
      return t > start && t <= end;
    }).length;
    const startD = new Date(start + DAY_MS);
    const endD = new Date(end);
    if (range === "Week") {
      buckets.push({
        label: DAY_LETTER[endD.getDay()],
        full: endD.toLocaleDateString("en-MY", { day: "numeric", month: "short" }),
        count,
      });
    } else {
      const fmt = (d: Date) => d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
      buckets.push({
        label: i === n - 1 || i === 0 || i === Math.floor(n / 2) ? fmt(startD) : "",
        full: `${fmt(startD)} – ${fmt(endD)}`,
        count,
      });
    }
  }
  return buckets;
}

export default function ActivityTrend({
  cases,
  range,
  now,
}: {
  cases: TrendCase[];
  range: TrendRange;
  now: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = useMemo(() => buildBuckets(cases, range, now), [cases, range, now]);

  const max = Math.max(...buckets.map((b) => b.count), 1);
  const total = buckets.reduce((a, b) => a + b.count, 0);
  const peakIdx = buckets.findIndex((b) => b.count === max);

  const W = 320;
  const H = 96;
  const AXIS_H = 16;
  const plotH = H - AXIS_H;
  const gap = 2;
  const barW = W / buckets.length - gap;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-bold text-guidr-text">Risky encounters</h3>
        <span className="text-xs text-guidr-muted">
          {total === 0 ? "none this period" : `${total} this period`}
        </span>
      </div>

      {total === 0 ? (
        <p className="text-sm text-guidr-muted py-4">
          Nothing risky in this period. Keep scanning anything suspicious.
        </p>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto block"
            role="img"
            aria-label={`Risky encounters per ${range === "Year" ? "month" : range === "Week" ? "day" : "period"}: ${buckets
              .map((b) => `${b.full}: ${b.count}`)
              .join(", ")}`}
          >
            <line x1={0} y1={plotH} x2={W} y2={plotH} stroke="#e5e7eb" strokeWidth={1} />

            {buckets.map((b, i) => {
              const h = b.count === 0 ? 2 : Math.max((b.count / max) * (plotH - 14), 4);
              const x = i * (barW + gap) + gap / 2;
              const y = plotH - h;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h + 4}
                    rx={3}
                    fill={b.count === 0 ? "#e5e7eb" : "#0d7377"}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                    clipPath={`inset(0 0 4px 0)`}
                  />
                  {i === peakIdx && b.count > 0 && (
                    <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#1f2933">
                      {b.count}
                    </text>
                  )}
                  {b.label && (
                    <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={8.5} fill="#7b8794">
                      {b.label}
                    </text>
                  )}
                  <rect
                    x={i * (barW + gap)}
                    y={0}
                    width={barW + gap}
                    height={H}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onTouchStart={() => setHover(hover === i ? null : i)}
                  />
                </g>
              );
            })}
          </svg>

          {hover !== null && (
            <div
              className="absolute -top-1 pointer-events-none bg-guidr-text text-white text-[11px] font-medium px-2 py-1 rounded-lg shadow-lg whitespace-nowrap"
              style={{
                left: `${((hover + 0.5) / buckets.length) * 100}%`,
                transform: "translateX(-50%)",
              }}
            >
              {buckets[hover].full}: {buckets[hover].count}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### 15.2 `app/components/WardOverview.tsx`
```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/app/context/UserContext";
import {
  subscribeIncomingGuardianRequests,
  subscribeGuardianEvents,
  type GuardianLink,
  type GuardianEvent,
} from "@/lib/firestore";

interface WardRow {
  wardUid: string;
  name: string;
  scams: number;
  suspicious: number;
  lastAt: number | null;
}

function riskChip(w: WardRow): { label: string; cls: string } {
  if (w.scams > 0) return { label: "Needs a check-in", cls: "bg-red-100 text-red-700" };
  if (w.suspicious > 0) return { label: "Watchful", cls: "bg-amber-100 text-amber-700" };
  return { label: "All quiet", cls: "bg-green-100 text-green-700" };
}

export default function WardOverview({ periodMs, now }: { periodMs: number; now: number }) {
  const { user } = useUser();
  const [links, setLinks] = useState<GuardianLink[]>([]);
  const [events, setEvents] = useState<GuardianEvent[]>([]);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeIncomingGuardianRequests(user.uid, setLinks);
    const u2 = subscribeGuardianEvents(user.uid, setEvents, 100);
    return () => {
      u1();
      u2();
    };
  }, [user]);

  const wards = useMemo<WardRow[]>(() => {
    const rows = new Map<string, WardRow>();
    for (const l of links) {
      if (l.status !== "active") continue;
      rows.set(l.wardUid, { wardUid: l.wardUid, name: l.wardName || "Someone you protect", scams: 0, suspicious: 0, lastAt: null });
    }
    for (const e of events) {
      if (now - e.at > periodMs) continue;
      const row = rows.get(e.wardUid);
      if (!row) continue;
      if (e.verdict === "SCAM") row.scams++;
      else row.suspicious++;
      if (!row.lastAt || e.at > row.lastAt) row.lastAt = e.at;
    }
    return [...rows.values()].sort(
      (a, b) => b.scams - a.scams || b.suspicious - a.suspicious || (b.lastAt || 0) - (a.lastAt || 0)
    );
  }, [links, events, periodMs, now]);

  if (wards.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-bold text-guidr-text">People you protect</h3>
        <Link href="/settings" className="text-xs font-bold text-guidr-primary hover:underline">
          Guardian hub →
        </Link>
      </div>
      <div className="flex flex-col">
        {wards.map((w, i) => {
          const chip = riskChip(w);
          const parts: string[] = [];
          if (w.scams > 0) parts.push(`${w.scams} scam${w.scams > 1 ? "s" : ""}`);
          if (w.suspicious > 0) parts.push(`${w.suspicious} suspicious`);
          return (
            <div
              key={w.wardUid}
              className={`flex items-center gap-3 py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}
            >
              <div
                className={`w-10 h-10 rounded-full text-white text-sm font-bold flex items-center justify-center shrink-0 ${
                  w.scams > 0 ? "bg-guidr-red" : w.suspicious > 0 ? "bg-amber-500" : "bg-guidr-primary"
                }`}
              >
                {w.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-guidr-text truncate">{w.name}</p>
                <p className="text-xs text-guidr-muted mt-0.5">
                  {parts.length ? `${parts.join(", ")} this period` : "No risky encounters this period"}
                </p>
              </div>
              <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${chip.cls}`}>
                {chip.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### 15.3 `app/components/ScamNewsCarousel.tsx`
```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ScamCategoryIcon from "@/app/components/ScamCategoryIcon";

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  image?: string;
  category?: string;
}

const INTERVAL = 6000;

interface CatMeta {
  grad: string;
  color: string;
  label: string;
}

const CAT_META: Record<string, CatMeta> = {
  "Phishing":             { grad: "linear-gradient(135deg,#b91c1c,#f87171)", color: "#ef4444", label: "Phishing" },
  "Impersonation":        { grad: "linear-gradient(135deg,#9333ea,#c084fc)", color: "#a855f7", label: "Impersonation" },
  "Investment Scam":      { grad: "linear-gradient(135deg,#1e40af,#3b82f6)", color: "#3b82f6", label: "Investment" },
  "Crypto Scam":          { grad: "linear-gradient(135deg,#b45309,#f59e0b)", color: "#f59e0b", label: "Crypto" },
  "Job Scam":             { grad: "linear-gradient(135deg,#0d7377,#14b8a6)", color: "#0d7377", label: "Job Scam" },
  "Loan Scam":            { grad: "linear-gradient(135deg,#047857,#10b981)", color: "#10b981", label: "Loan Scam" },
  "Romance Scam":         { grad: "linear-gradient(135deg,#be185d,#f472b6)", color: "#ec4899", label: "Romance" },
  "Lottery Scam":         { grad: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#8b5cf6", label: "Lottery" },
  "Online Shopping Scam": { grad: "linear-gradient(135deg,#4338ca,#818cf8)", color: "#6366f1", label: "Shopping" },
  "Tech Support Scam":    { grad: "linear-gradient(135deg,#334155,#64748b)", color: "#475569", label: "Tech Support" },
  "Delivery Scam":        { grad: "linear-gradient(135deg,#c2410c,#fb923c)", color: "#f97316", label: "Delivery" },
  "Charity Scam":         { grad: "linear-gradient(135deg,#0f766e,#2dd4bf)", color: "#14b8a6", label: "Charity" },
};

const GENERAL: CatMeta = { grad: "linear-gradient(135deg,#0d7377,#14b8a6)", color: "#0d7377", label: "Scam Alert" };

function metaFor(category?: string): CatMeta {
  if (!category) return GENERAL;
  return CAT_META[category] ?? GENERAL;
}

function timeAgo(pubDate: string): string {
  if (!pubDate) return "";
  const date = new Date(pubDate);
  if (isNaN(date.getTime())) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ScamNewsCarousel() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  const progressRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (bust = false) => {
    try {
      const r = await fetch("/api/scam-news" + (bust ? `?t=${Date.now()}` : ""));
      const d = await r.json();
      const list: NewsItem[] = Array.isArray(d.items) ? d.items : [];
      setItems(list);
      setIdx(0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (items.length <= 1) return;
    const bar = progressRef.current;
    if (bar) {
      bar.style.transition = "none";
      bar.style.width = "0%";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          bar.style.transition = `width ${INTERVAL}ms linear`;
          bar.style.width = "100%";
        })
      );
    }
    const t = setTimeout(() => setIdx((i) => (i + 1) % items.length), INTERVAL);
    return () => clearTimeout(t);
  }, [idx, items]);

  const go = (dir: number) => {
    if (items.length === 0) return;
    setIdx((i) => (i + dir + items.length) % items.length);
  };

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await load(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const header = (
    <div className="flex items-center justify-between mb-3 px-1">
      <div className="flex items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <h3 className="text-base font-bold text-guidr-text">Scam news worldwide</h3>
      </div>
      <button
        type="button"
        onClick={refresh}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 border border-teal-200 bg-teal-50 hover:bg-teal-100 transition-colors"
        aria-label="Refresh scam news"
      >
        <svg
          width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
          style={{ transition: "transform 0.6s ease", transform: refreshing ? "rotate(360deg)" : "none" }}
        >
          <path d="M23 4v6h-6" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        <span className="text-[9px] font-semibold text-guidr-primary">Updated daily</span>
      </button>
    </div>
  );

  if (loading) {
    return (
      <div>
        {header}
        <div className="py-10 flex justify-center">
          <div className="w-6 h-6 border-2 border-guidr-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        {header}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-guidr-muted">
            Couldn&rsquo;t load the latest headlines right now. Check back soon.
          </p>
        </div>
      </div>
    );
  }

  const a = items[idx];
  const meta = metaFor(a.category);
  const showImage = !!a.image && !imgFailed[a.link];
  const time = timeAgo(a.pubDate);

  return (
    <div>
      {header}

      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm mb-2.5">
        <div
          className="relative h-[120px] flex items-center justify-center overflow-hidden"
          style={{ background: meta.grad }}
        >
          {showImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.image}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed((p) => ({ ...p, [a.link]: true }))}
              />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top,rgba(0,0,0,0.45),transparent 55%)" }} />
            </>
          ) : (
            <>
              <div className="absolute opacity-[0.12] text-white" aria-hidden="true">
                <ScamCategoryIcon scamType={a.category} size={92} />
              </div>
              <div className="relative z-[1] text-white/80">
                <ScamCategoryIcon scamType={a.category} size={36} />
              </div>
              <div
                className="absolute bottom-0 left-0 right-0 h-12"
                style={{ background: "linear-gradient(to top,rgba(0,0,0,0.35),transparent)" }}
              />
            </>
          )}

          <div className="absolute bottom-0 left-0 right-0 flex justify-between items-center px-2.5 py-1.5 z-[2]">
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-white/20 border border-white/25">
              <span className="text-white">
                <ScamCategoryIcon scamType={a.category} size={10} />
              </span>
              <span className="text-[8px] font-semibold text-white uppercase tracking-wide">{meta.label}</span>
            </span>
            {time && <span className="text-[8px] text-white/75">{time}</span>}
          </div>

          <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-white/15 z-[2]">
            <div ref={progressRef} className="h-full bg-white/60 rounded-r" style={{ width: "0%" }} />
          </div>
        </div>

        <a href={a.link} target="_blank" rel="noopener noreferrer" className="block p-3.5 pt-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
            <span className="text-[9px] font-semibold uppercase tracking-wide text-guidr-primary truncate">
              {a.source}
            </span>
          </div>
          <p className="text-[13px] font-semibold text-guidr-text leading-snug line-clamp-3 min-h-[54px]">
            {a.title}
          </p>
          <div className="flex justify-between items-center mt-2.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-guidr-primary">
              Read article
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </span>
            <div className="flex gap-1 items-center">
              {items.map((it, i) => (
                <button
                  key={it.link}
                  type="button"
                  aria-label={`Go to article ${i + 1}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setIdx(i);
                  }}
                  className="h-[5px] rounded-full transition-all"
                  style={{
                    width: i === idx ? 16 : 5,
                    background: i === idx ? meta.color : "#e2e8f0",
                  }}
                />
              ))}
            </div>
          </div>
        </a>
      </div>

      <div className="flex justify-between items-center px-1">
        <button
          type="button"
          onClick={() => go(-1)}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 bg-slate-100 border border-gray-100 hover:bg-slate-200 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="text-[10px] text-slate-600">Prev</span>
        </button>
        <span className="text-[10px] text-guidr-muted">
          {idx + 1} of {items.length}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 bg-guidr-primary hover:opacity-90 transition-opacity"
        >
          <span className="text-[10px] text-white">Next</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

### 15.4 `app/analytics/page.tsx` (verbatim — Analytics)
```tsx
"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "@/app/context/UserContext";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import EmailComposerModal from "@/app/components/EmailComposerModal";
import Skeleton from "@/app/components/Skeleton";
import ScamNewsCarousel from "@/app/components/ScamNewsCarousel";
import ActivityTrend from "@/app/components/ActivityTrend";
import WardOverview from "@/app/components/WardOverview";
import ScamCategoryIcon, { categoryColor, displayCategoryName } from "@/app/components/ScamCategoryIcon";
import { normalizeScamType, SAFE_CATEGORY, formatTrend } from "@/lib/scam-categories";

interface CaseDoc {
  id: string;
  verdict: "SCAM" | "SUSPICIOUS" | "LIKELY_SAFE";
  confidence: string;
  scamType: string;
  summary: string;
  originalMessage: string;
  manipulationTactics: string[];
  reportedToNSRC: boolean;
  createdAt: any;
  channel?: string;
}

function caseDate(c: CaseDoc): Date | null {
  const t = c.createdAt;
  if (!t) return null;
  const d = t.toDate ? t.toDate() : new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

const PARTNER_CTA_EMAIL = "guidrdeveloper@gmail.com";
const PARTNER_CTA_SUBJECT = "Guidr Partnership";
const PARTNER_CTA_BODY =
  `Hi Guidr team,\n\nI'd like to explore a partnership opportunity with Guidr.\n\n` +
  `A little about us:\n- Company:\n- Website:\n- What we'd like to discuss:\n\n` +
  `Looking forward to hearing back.\n\nThanks,`;

const RANGES = [
  { key: "Week", label: "This week", days: 7 },
  { key: "Month", label: "This month", days: 30 },
  { key: "Year", label: "This year", days: 365 },
] as const;

export default function AnalyticsPage() {
  const { user } = useUser();
  const [cases, setCases] = useState<CaseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("Month");
  const [showPartnerPicker, setShowPartnerPicker] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "cases"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CaseDoc));
      setCases(data);
      setNow(Date.now());
      setLoading(false);
    }, (error) => {
      logger.error("Error fetching user cases:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const days = RANGES.find((r) => r.key === range)!.days;
  const rangeLabel = RANGES.find((r) => r.key === range)!.label;
  const periodMs = days * 86_400_000;

  const current = cases.filter((c) => {
    const d = caseDate(c);
    return d ? now - d.getTime() <= periodMs : false;
  });
  const previous = cases.filter((c) => {
    const d = caseDate(c);
    if (!d) return false;
    const age = now - d.getTime();
    return age > periodMs && age <= periodMs * 2;
  });

  const stats = {
    casesFiled: current.length,
    toNSRC: current.filter((c) => c.reportedToNSRC).length,
    scams: current.filter((c) => c.verdict === "SCAM").length,
  };

  const trendPct =
    previous.length === 0
      ? current.length > 0
        ? 100
        : 0
      : Math.round(((current.length - previous.length) / previous.length) * 100);
  const trendUp = current.length >= previous.length;

  const countByCategory = (list: CaseDoc[]) => {
    const map: Record<string, number> = {};
    list.forEach((c) => {
      const cat = normalizeScamType(c.scamType);
      if (cat === SAFE_CATEGORY) return;
      map[cat] = (map[cat] || 0) + 1;
    });
    return map;
  };

  const currentByCat = countByCategory(current);
  const prevByCat = countByCategory(previous);

  const threatTotal =
    Object.values(currentByCat).reduce((a, b) => a + b, 0) || 1;

  const scamTypes = Object.entries(currentByCat)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([label, count]) => ({
      label,
      pct: Math.round((count / threatTotal) * 100),
    }));

  const emerging = Object.entries(currentByCat)
    .map(([label, count]) => {
      const prev = prevByCat[label] || 0;
      return { label, count, prev, trend: formatTrend(count, prev) };
    })
    .filter((e) => e.count > e.prev)
    .sort((a, b) => {
      const growth = (x: typeof a) => (x.prev === 0 ? Infinity : (x.count - x.prev) / x.prev);
      return growth(b) - growth(a);
    })
    .slice(0, 3);

  return (
    <div className="guidr-container">
      <Header />
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 pb-safe flex flex-col gap-5">

        <h1 className="text-2xl font-bold text-guidr-text guidr-animate-in guidr-stagger-1">
          Analytics
        </h1>

        <div className="flex gap-2 guidr-animate-in guidr-stagger-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
                range === r.key
                  ? "bg-guidr-primary text-white border-guidr-primary"
                  : "bg-white text-guidr-muted border-gray-200 hover:bg-gray-50"
              }`}
            >
              {r.key}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 guidr-animate-in guidr-stagger-2">
          <div className="flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <span className="text-2xl font-bold text-guidr-text leading-none">{stats.casesFiled}</span>
            )}
            <span className="text-xs text-guidr-muted mt-1.5">Cases filed</span>
          </div>
          <div className="flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <span className="text-2xl font-bold text-guidr-text leading-none">{stats.toNSRC}</span>
            )}
            <span className="text-xs text-guidr-muted mt-1.5">To NSRC</span>
          </div>
          <div className="flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <span className="text-2xl font-bold text-guidr-text leading-none">{stats.scams}</span>
            )}
            <span className="text-xs text-guidr-muted mt-1.5">Scams</span>
          </div>
          <div className="flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <span
                className={`text-2xl font-bold leading-none flex items-center gap-1 ${
                  trendUp ? "text-guidr-red" : "text-green-600"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {trendUp ? (
                    <>
                      <path d="M12 19V5" />
                      <path d="m5 12 7-7 7 7" />
                    </>
                  ) : (
                    <>
                      <path d="M12 5v14" />
                      <path d="m19 12-7 7-7-7" />
                    </>
                  )}
                </svg>
                {`${Math.abs(trendPct)}%`}
              </span>
            )}
            <span className="text-xs text-guidr-muted mt-1.5">{rangeLabel}</span>
          </div>
        </div>

        <div className="guidr-animate-in guidr-stagger-3">
          <WardOverview periodMs={periodMs} now={now} />
        </div>

        {!loading && (
          <div className="guidr-animate-in guidr-stagger-3">
            <ActivityTrend
              cases={cases.map((c) => ({ verdict: c.verdict, date: caseDate(c) }))}
              range={range}
              now={now}
            />
          </div>
        )}

        <div className="relative bg-guidr-blue-light/50 rounded-2xl p-4 border border-dashed border-guidr-blue/40 guidr-animate-in guidr-stagger-3">
          <div className="mb-3">
            <span className="text-[10px] font-bold tracking-widest text-guidr-muted uppercase bg-white/70 px-2 py-0.5 rounded">
              Advertisement
            </span>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="shrink-0 w-11 h-11 rounded-xl bg-guidr-blue flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-guidr-text">This ad space is open</p>
              <p className="text-sm text-guidr-muted">Advertise with Guidr and reach Malaysians actively fighting scams.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPartnerPicker(true)}
            className="block w-full text-center bg-guidr-blue hover:bg-blue-600 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Inquire to advertise →
          </button>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 guidr-animate-in guidr-stagger-4">
          <h3 className="text-base font-bold text-guidr-text mb-4">Trending now</h3>
          {scamTypes.length === 0 ? (
            <p className="text-sm text-guidr-muted">No cases in this period yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {scamTypes.map((v) => {
                const color = categoryColor(v.label);
                return (
                  <div key={v.label}>
                    <div className="flex justify-between items-center text-sm mb-1.5">
                      <span className="flex items-center gap-2 font-medium text-guidr-text">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${color.bg}`}>
                          <ScamCategoryIcon scamType={v.label} size={14} className={color.text} />
                        </span>
                        {displayCategoryName(v.label)}
                      </span>
                      <span className="text-guidr-muted font-medium">{v.pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-guidr-bg rounded-full overflow-hidden">
                      <div
                        className="h-full bg-guidr-primary rounded-full transition-all duration-700"
                        style={{ width: `${v.pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {emerging.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-1.5 mb-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                </svg>
                <h4 className="text-xs font-bold tracking-widest text-guidr-muted uppercase">Emerging</h4>
              </div>
              <div className="flex flex-col gap-2.5">
                {emerging.map((e) => {
                  const color = categoryColor(e.label);
                  return (
                    <div key={e.label} className="flex items-center gap-2.5">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${color.bg}`}>
                        <ScamCategoryIcon scamType={e.label} size={15} className={color.text} />
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-medium text-guidr-text truncate">{displayCategoryName(e.label)}</span>
                      <span className="shrink-0 text-xs font-bold text-guidr-red">{e.trend}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="guidr-animate-in guidr-stagger-5">
          <ScamNewsCarousel />
        </div>

        <Link
          href="/cases"
          className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-guidr-primary/40 hover:shadow-md transition-all guidr-animate-in guidr-stagger-6"
        >
          <div className="shrink-0 w-11 h-11 rounded-xl bg-guidr-primary-light flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-guidr-text">My Cases</p>
            <p className="text-sm text-guidr-muted">
              {loading
                ? "View your full case history"
                : `View all ${cases.length} ${cases.length === 1 ? "case" : "cases"} you've filed`}
            </p>
          </div>
          <svg className="shrink-0 text-guidr-muted" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>

      </main>
      <BottomNav />

      <EmailComposerModal
        isOpen={showPartnerPicker}
        onClose={() => setShowPartnerPicker(false)}
        to={PARTNER_CTA_EMAIL}
        subject={PARTNER_CTA_SUBJECT}
        body={PARTNER_CTA_BODY}
        title="Partner with Guidr"
        description="Pick your email provider. A draft is pre-filled to get you started."
      />
    </div>
  );
}
```

## 16. `app/api/scam-news/route.ts` (verbatim)
> **Read the Next 16 route-handler + caching docs first** (`revalidate` must stay a
> literal). This route fetches public RSS feeds server-side; no API key needed.
```ts
import { NextResponse } from "next/server";
import { normalizeScamType } from "@/lib/scam-categories";

export const revalidate = 86_400; // 24h in seconds
const DAY = 86_400;

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  image: string;
  category: string;
}

interface Source {
  url: string;
  name: string;
  filter: boolean;
}

const SOURCES: Source[] = [
  {
    url:
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent('scam OR fraud "scam" when:7d') +
      "&hl=en-US&gl=US&ceid=US:en",
    name: "Google News",
    filter: false,
  },
  { url: "https://www.malwarebytes.com/blog/feed/index.xml", name: "Malwarebytes", filter: true },
  { url: "https://www.bleepingcomputer.com/feed/", name: "BleepingComputer", filter: true },
  { url: "https://feeds.feedburner.com/TheHackersNews", name: "The Hacker News", filter: true },
];

const RELEVANCE = /scam|fraud|phish|fake|impersonat|romance|sextortion|extort|fraudster|spoof|smish|vishing|deepfake|419|catfish/i;

function extract(xml: string, re: RegExp): string {
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function usableImage(url: string): boolean {
  if (!url || url.startsWith("data:")) return false;
  if (/\.svg(\?|$)/i.test(url)) return false;
  if (/(spacer|pixel|1x1|blank|tracking)/i.test(url)) return false;
  return /^https?:\/\//i.test(url);
}

function parseImage(block: string): string {
  const media = block.match(/<media:(?:content|thumbnail)[^>]*\burl="([^"]+)"/i);
  if (media && usableImage(media[1])) return media[1];
  const encUrlFirst = block.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*type="image/i);
  if (encUrlFirst && usableImage(encUrlFirst[1])) return encUrlFirst[1];
  const encTypeFirst = block.match(/<enclosure[^>]*type="image[^"]*"[^>]*\burl="([^"]+)"/i);
  if (encTypeFirst && usableImage(encTypeFirst[1])) return encTypeFirst[1];
  for (const m of block.matchAll(/<img[^>]*\bsrc="([^"]+)"/gi)) {
    if (usableImage(m[1])) return m[1];
  }
  return "";
}

function parseFeed(xml: string, src: Source): NewsItem[] {
  const blocks = xml.split(/<item>/).slice(1);
  const out: NewsItem[] = [];

  for (const block of blocks) {
    const rawTitle = clean(extract(block, /<title>([\s\S]*?)<\/title>/));
    if (!rawTitle) continue;

    const sourceFromTag = clean(extract(block, /<source[^>]*>([\s\S]*?)<\/source>/));
    const dashIdx = rawTitle.lastIndexOf(" - ");
    const hasInlineSource = !sourceFromTag && dashIdx > 0;
    const title = hasInlineSource ? rawTitle.slice(0, dashIdx).trim() : rawTitle;
    const source = sourceFromTag || (hasInlineSource ? rawTitle.slice(dashIdx + 3).trim() : src.name);

    if (src.filter && !RELEVANCE.test(title)) continue;

    out.push({
      title,
      link: clean(extract(block, /<link>([\s\S]*?)<\/link>/)),
      source,
      pubDate: extract(block, /<pubDate>([\s\S]*?)<\/pubDate>/),
      image: parseImage(block),
      category: normalizeScamType(title),
    });
  }

  return out;
}

async function fetchSource(src: Source): Promise<NewsItem[]> {
  try {
    const res = await fetch(src.url, {
      headers: { "User-Agent": "GuidrBot/1.0 (+https://guidr.app)" },
      next: { revalidate: DAY },
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), src);
  } catch (err) {
    console.error(`scam-news: ${src.name} fetch failed:`, err);
    return [];
  }
}

export async function GET() {
  const settled = await Promise.allSettled(SOURCES.map(fetchSource));
  const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  const byTitle = new Map<string, NewsItem>();
  for (const item of all) {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").trim();
    const existing = byTitle.get(key);
    if (!existing || (!existing.image && item.image)) byTitle.set(key, item);
  }

  const items = [...byTitle.values()]
    .sort((a, b) => {
      const ta = Date.parse(a.pubDate) || 0;
      const tb = Date.parse(b.pubDate) || 0;
      if (tb !== ta) return tb - ta;
      return (b.image ? 1 : 0) - (a.image ? 1 : 0);
    })
    .slice(0, 8);

  return NextResponse.json({ items });
}
```

## 17. Supporting files so links resolve

### 17.1 `public/manifest.json`
```json
{
  "name": "Guidr — Security Made Simple",
  "short_name": "Guidr",
  "description": "Investigate suspicious messages, detect scams, and protect yourself from online fraud.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#edf1f3",
  "theme_color": "#0d7377",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### 17.2 `app/ms/page.tsx` (minimal — MS marketing so the language switch works)
```tsx
import MarketingLanding from "@/app/components/MarketingLanding";

export default function MsLanding() {
  return <MarketingLanding locale="ms" />;
}
```

### 17.3 `app/onboarding/page.tsx` (minimal — routes on to login)
```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Onboarding() {
  const router = useRouter();
  useEffect(() => {
    try {
      localStorage.setItem("guidr_onboarded", "1");
    } catch {}
    router.replace("/login");
  }, [router]);
  return null;
}
```

### 17.4 `app/login/page.tsx` (minimal auth — so you can reach the signed-in pages)
> Not part of the exact-port surface — a small entry point so Home (signed-in) and
> Analytics are reachable. Enable **Email/Password** and **Google** sign-in in the
> Firebase console. Styling uses the guidr tokens so it doesn't look out of place.
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setErr("");
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const withEmail = async (create: boolean) => {
    setErr("");
    setBusy(true);
    try {
      if (create) await createUserWithEmailAndPassword(auth, email, pw);
      else await signInWithEmailAndPassword(auth, email, pw);
      router.push("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-guidr-bg flex items-center justify-center px-5">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-guidr-text text-center">Sign in to Guidr</h1>

        <button
          type="button"
          onClick={google}
          disabled={busy}
          className="w-full py-3 rounded-xl bg-guidr-primary-dark text-white font-semibold hover:bg-guidr-primary transition-colors disabled:opacity-60"
        >
          Continue with Google
        </button>

        <div className="flex items-center gap-3 text-xs text-guidr-muted">
          <span className="flex-1 h-px bg-gray-200" /> or <span className="flex-1 h-px bg-gray-200" />
        </div>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-guidr-text focus:border-guidr-primary outline-none"
        />
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Password"
          className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-guidr-text focus:border-guidr-primary outline-none"
        />

        {err && <p className="text-xs text-guidr-red">{err}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => withEmail(false)}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-guidr-primary text-white text-sm font-semibold disabled:opacity-60"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => withEmail(true)}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-white border border-gray-200 text-guidr-text text-sm font-semibold disabled:opacity-60"
          >
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
}
```

## 18. Firebase setup & demo data (so the signed-in pages show content)

1. **Firebase project** → add a **Web app**, copy its config into `.env.local` (§2.6).
2. **Authentication** → enable **Email/Password** and **Google** providers.
3. **Firestore** → create the database. For a hackathon demo you can start in
   **test mode**, or paste minimal rules that let a signed-in user read the public
   `stats`/`scams` and their own `cases`:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /stats/{doc}  { allow read: if true; }
       match /scams/{doc}  { allow read: if true; }
       match /users/{uid}  { allow read, write: if request.auth.uid == uid; }
       match /cases/{id}   { allow read, write: if request.auth != null; }
       match /guardian_links/{id} { allow read: if request.auth != null; }
       match /users/{uid}/guardian_events/{id} { allow read: if request.auth.uid == uid; }
     }
   }
   ```
   > These are demo rules. The production Guidr rules are stricter (per-user
   > lockdown, server-only writes). Tighten before any real deployment.

### Seed documents (add via Firebase console or a one-off script)

**`stats/global`** — powers Home's three counters:
```json
{ "totalCases": 1280, "reportedNSRC": 640, "totalUsers": 3120 }
```

**`scams/*`** — Home's "Top Trending Scams" (a few docs; `name` is a canonical
category, `cases` is a number):
```json
{ "name": "Phishing", "cases": 420 }
{ "name": "Job Scam", "cases": 265 }
{ "name": "Investment Scam", "cases": 180 }
```

**`cases/*`** — Analytics reads these `where userId == <your uid>`. Add a handful
with recent `createdAt` so the charts and breakdowns populate:
```json
{
  "userId": "<YOUR_AUTH_UID>",
  "verdict": "SCAM",
  "confidence": "HIGH",
  "scamType": "Phishing",
  "summary": "Fake bank OTP request",
  "originalMessage": "Your account is suspended, verify at ...",
  "manipulationTactics": ["urgency", "authority"],
  "reportedToNSRC": true,
  "channel": "SMS",
  "createdAt": "<recent Firestore Timestamp>"
}
```
> `createdAt` must be a Firestore **Timestamp** (the console's "timestamp" field
> type), not a string. Vary `verdict` (`SCAM`/`SUSPICIOUS`/`LIKELY_SAFE`),
> `scamType`, and the dates across the last week/month so the range pills, the
> trend %, ActivityTrend, and Trending/Emerging all show data.
>
> `WardOverview` stays hidden unless you also add a `guardian_links` doc with
> `guardianUid == your uid` and `status: "active"` — optional for the demo.

---

## 19. Run

```bash
npm install
# create every file above, copy the brand assets (§3), fill .env.local
npm run dev      # http://localhost:3000
```

---

## 20. Acceptance criteria

- [ ] `npm run dev` starts; `/` and `/analytics` render with no console errors.
- [ ] **Signed-out `/`** renders `MarketingLanding` (EN); `/ms` renders the MS variant; the language switch toggles between them.
- [ ] Sign in via `/login` → **`/`** shows Header + HeroSection (localized greeting/tagline) + StatsCards (live `stats/global` + top-3 `scams`) + HowItWorks + BottomNav.
- [ ] **`/analytics`** streams your `cases`; the Week/Month/Year pills recompute the 2×2 stat cards, the trend arrow/%, the ActivityTrend bars, and the Trending/Emerging lists. Empty states render when there's no data.
- [ ] `ScamNewsCarousel` loads from `/api/scam-news` and auto-advances every 6s.
- [ ] The ad slot opens `EmailComposerModal`.
- [ ] Dark mode works when `users/{uid}.theme` is `"dark"` (or `"system"` on a dark OS) — the `.dark` class flips every token.
- [ ] Responsive: phone-frame + bottom nav below `1024px`; fixed sidebar + centered content at `≥1024px` (driven by `.guidr-container`).
- [ ] Realtime: editing a `cases` / `scams` / `stats` doc updates the UI live, no refresh.
- [ ] `npm run lint` passes; TypeScript is strict-clean.

## 21. Out of scope (do NOT build — these are intentionally omitted)
The scan pipeline (`/scan`, AI analysis), Stripe/pricing, guardian invite/claim
flows, the browser extension, push notifications, service worker, app-lock,
install prompt, toasts, and the live notifications dropdown. Links to `/scan`,
`/cases`, `/learn`, `/profile`, `/settings` will 404 — that's expected; only Home
and Analytics are in scope. `NotificationsBell`, `ClientProviders`, `UserContext`,
and `lib/firestore.ts` are deliberately the trimmed/stub versions given above.

---

## 22. Complete file tree
```
guidr-codex/
├─ package.json                          (§2.1, minimal)
├─ tsconfig.json                         (§2.2)
├─ next.config.ts                        (§2.3, minimal)
├─ postcss.config.mjs                    (§2.4)
├─ eslint.config.mjs                     (§2.5)
├─ .env.local                            (§2.6, you fill)
├─ app/
│  ├─ globals.css                        (§9,  verbatim)
│  ├─ layout.tsx                         (§11.1, verbatim)
│  ├─ page.tsx                           (§14.7, verbatim — Home)
│  ├─ favicon.ico                        (copy from repo)
│  ├─ ms/page.tsx                        (§17.2, minimal)
│  ├─ login/page.tsx                     (§17.4, minimal auth)
│  ├─ onboarding/page.tsx                (§17.3, minimal)
│  ├─ analytics/page.tsx                 (§15.4, verbatim — Analytics)
│  ├─ api/scam-news/route.ts             (§16,  verbatim)
│  ├─ context/
│  │  ├─ UserContext.tsx                 (§10.1, minimal)
│  │  └─ PrefsContext.tsx                (§10.2, verbatim)
│  └─ components/
│     ├─ ClientProviders.tsx             (§11.2, minimal)
│     ├─ NotificationsBell.tsx           (§11.3, stub)
│     ├─ Header.tsx                       (§12.1, verbatim)
│     ├─ BottomNav.tsx                    (§12.2, verbatim)
│     ├─ Skeleton.tsx                     (§13.1, verbatim)
│     ├─ ScamCategoryIcon.tsx             (§13.2, verbatim)
│     ├─ EmailComposerModal.tsx           (§13.3, verbatim)
│     ├─ LandingGate.tsx                  (§14.1, verbatim)
│     ├─ GetStartedButton.tsx             (§14.2, verbatim)
│     ├─ HeroSection.tsx                  (§14.3, verbatim)
│     ├─ StatsCards.tsx                   (§14.4, verbatim)
│     ├─ HowItWorks.tsx                   (§14.5, verbatim)
│     ├─ MarketingLanding.tsx             (§14.6, verbatim)
│     ├─ ActivityTrend.tsx                (§15.1, verbatim)
│     ├─ WardOverview.tsx                 (§15.2, verbatim)
│     └─ ScamNewsCarousel.tsx             (§15.3, verbatim)
├─ lib/
│  ├─ logger.ts                          (§4,  minimal)
│  ├─ firebase.ts                        (§5,  verbatim)
│  ├─ i18n.ts                            (§6,  verbatim)
│  ├─ scam-categories.ts                 (§7,  verbatim)
│  └─ firestore.ts                       (§8,  minimal)
└─ public/
   ├─ manifest.json                      (§17.1)
   ├─ og.png                             (copy from repo)
   ├─ images/Brand Logo.png              (copy from repo)
   ├─ images/Brand Icon.png              (copy from repo)
   ├─ icons/icon-192.png                 (copy from repo)
   └─ icons/icon-512.png                 (copy from repo)
```

**End of build prompt.** Everything marked *verbatim* must be reproduced exactly;
everything marked *minimal*/*stub* is a deliberate out-of-scope replacement.
