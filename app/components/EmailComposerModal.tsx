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
