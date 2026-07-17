"use client";

/**
 * App-wide toast notifications.
 *
 * Replaces scattered `alert()` calls and one-off inline toasts with a single
 * non-blocking, mobile-friendly feedback channel. Use it for the outcome of
 * any user action that could otherwise fail silently:
 *
 *   const { showToast } = useToast();
 *   showToast("Contact added", "success");
 *   showToast("Couldn't save — check your connection", "error");
 */

import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

const STYLES: Record<ToastType, { bg: string; icon: ReactNode }> = {
  success: {
    bg: "bg-green-600",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  error: {
    bg: "bg-red-600",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  info: {
    bg: "bg-guidr-primary",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    // Errors linger a little longer so they're readable.
    const ttl = type === "error" ? 5000 : 3000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ttl);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed inset-x-0 top-0 z-[200] flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={{ paddingTop: "calc(5rem + env(safe-area-inset-top, 0px))" }}
      >
        {toasts.map((t) => {
          const style = STYLES[t.type];
          return (
            <div
              key={t.id}
              role={t.type === "error" ? "alert" : "status"}
              aria-live={t.type === "error" ? "assertive" : "polite"}
              className={`pointer-events-auto max-w-sm w-fit flex items-center gap-2 ${style.bg} text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg animate-[guidr-fade-in_0.2s_ease-out]`}
            >
              <span className="shrink-0">{style.icon}</span>
              <span className="leading-snug">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
