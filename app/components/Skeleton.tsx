/**
 * Loading skeleton primitive — a gently pulsing gray block sized via
 * className. Used in place of spinners/dots while waiting for data,
 * so users see the page's shape immediately instead of a blank field.
 *
 *   <Skeleton className="h-6 w-24" />          → text-line shape
 *   <Skeleton className="h-9 w-9 rounded-xl" /> → icon shape
 *   <Skeleton className="h-32 w-full" />        → card shape
 *
 * Honors `prefers-reduced-motion` via Tailwind's animate-pulse, which
 * the user's OS setting can disable for accessibility.
 */
export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-gray-200 ${className}`}
    />
  );
}
