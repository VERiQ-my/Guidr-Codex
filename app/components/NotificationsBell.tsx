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
