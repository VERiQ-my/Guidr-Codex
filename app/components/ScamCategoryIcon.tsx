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
