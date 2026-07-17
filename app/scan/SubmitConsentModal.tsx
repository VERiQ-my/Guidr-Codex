"use client";

import { useState } from "react";

interface SubmitConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (agencies: string[]) => void;
  reportId: string;
}

const AGENCIES = [
  {
    id: "nsrc",
    name: "NSRC (997)",
    fullName: "National Scam Response Centre",
    description: "Malaysia's primary scam response authority under PDRM",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
  },
  {
    id: "pdrm",
    name: "PDRM",
    fullName: "Polis Diraja Malaysia (Commercial Crime Investigation Department)",
    description: "Official police report for criminal investigation",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: "mcmc",
    name: "MCMC",
    fullName: "Malaysian Communications and Multimedia Commission",
    description: "For reporting online fraud and digital scams",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
];

export default function SubmitConsentModal({
  isOpen,
  onClose,
  onConfirm,
  reportId,
}: SubmitConsentModalProps) {
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>(["nsrc", "pdrm"]);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  function toggleAgency(id: string) {
    setSelectedAgencies((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    if (!agreedToTerms || selectedAgencies.length === 0) return;
    setIsSubmitting(true);

    // Simulate submission delay (real API would go to NSRC/PDRM endpoints)
    await new Promise((r) => setTimeout(r, 2000));

    setSubmitted(true);
    setIsSubmitting(false);

    // Notify parent after brief success display
    setTimeout(() => {
      onConfirm(selectedAgencies);
    }, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[guidr-fade-in_0.2s_ease-out]"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md mx-auto bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-[guidr-scale-in_0.25s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-bold text-guidr-text">Submit Report</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7b8794" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-guidr-muted">
            Report <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{reportId}</span> will be submitted to the selected agencies.
          </p>
        </div>

        <div className="mx-6 border-t border-gray-100" />

        {submitted ? (
          /* ── Success State ── */
          <div className="px-6 py-10 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-guidr-green-light flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h4 className="text-lg font-bold text-guidr-text">Report Submitted</h4>
            <p className="text-sm text-guidr-muted text-center">
              Your report has been sent to{" "}
              {selectedAgencies
                .map((id) => AGENCIES.find((a) => a.id === id)?.name)
                .join(" & ")}
              . They will review and take action accordingly.
            </p>
          </div>
        ) : (
          /* ── Selection State ── */
          <>
            {/* Agency selection */}
            <div className="px-6 py-4 flex flex-col gap-2">
              <p className="text-xs font-bold tracking-wider text-guidr-muted uppercase mb-1">
                Select Agencies
              </p>
              {AGENCIES.map((agency) => {
                const isSelected = selectedAgencies.includes(agency.id);
                return (
                  <button
                    key={agency.id}
                    type="button"
                    onClick={() => toggleAgency(agency.id)}
                    className={`
                      w-full flex items-start gap-3 p-3.5 rounded-xl text-left
                      transition-all duration-200
                      ${isSelected
                        ? "bg-guidr-primary-light/50 border-2 border-guidr-primary/30"
                        : "bg-gray-50 border-2 border-transparent hover:bg-gray-100"
                      }
                    `}
                  >
                    {/* Checkbox */}
                    <div className={`
                      shrink-0 w-5 h-5 rounded-md mt-0.5 flex items-center justify-center
                      transition-colors duration-200
                      ${isSelected
                        ? "bg-guidr-primary"
                        : "border-2 border-gray-300"
                      }
                    `}>
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>

                    {/* Agency info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`${isSelected ? "text-guidr-primary" : "text-guidr-muted"}`}>
                          {agency.icon}
                        </div>
                        <span className="text-sm font-semibold text-guidr-text">{agency.name}</span>
                      </div>
                      <p className="text-xs text-guidr-muted mt-0.5 leading-relaxed">{agency.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Consent checkbox */}
            <div className="px-6 pb-4">
              <button
                type="button"
                onClick={() => setAgreedToTerms(!agreedToTerms)}
                className="flex items-start gap-3 w-full text-left"
              >
                <div className={`
                  shrink-0 w-5 h-5 rounded-md mt-0.5 flex items-center justify-center
                  transition-colors duration-200
                  ${agreedToTerms
                    ? "bg-guidr-primary"
                    : "border-2 border-gray-300"
                  }
                `}>
                  {agreedToTerms && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <p className="text-xs text-guidr-muted leading-relaxed">
                  I consent to Guidr submitting this report on my behalf. I understand
                  the report contains AI-generated analysis and I should verify all
                  details before any official follow-up.
                </p>
              </button>
            </div>

            {/* Submit button */}
            <div className="px-6 pb-6">
              <button
                onClick={handleSubmit}
                disabled={!agreedToTerms || selectedAgencies.length === 0 || isSubmitting}
                className={`
                  w-full flex items-center justify-center gap-2.5
                  py-4 px-6 rounded-xl
                  font-semibold text-base
                  transition-all duration-200 ease-out
                  ${agreedToTerms && selectedAgencies.length > 0
                    ? "bg-guidr-primary text-white shadow-lg shadow-guidr-primary/25 hover:bg-guidr-primary-dark active:scale-[0.98]"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }
                `}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    Submit to {selectedAgencies.length} {selectedAgencies.length === 1 ? "agency" : "agencies"}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
