"use client";

import { logger } from "@/lib/logger";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ChannelPills from "./ChannelPills";
import CameraCapture from "./CameraCapture";
import { useToast } from "@/app/context/ToastContext";
import { usePrefs } from "@/app/context/PrefsContext";
import { useUser } from "@/app/context/UserContext";
import { subscribeEntitlements } from "@/lib/firestore";
import { isPro, scansRemaining, FREE_DAILY_SCANS, type Entitlements } from "@/lib/plan";

export default function ScanForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const { defaultScanChannel } = usePrefs();
  const { user } = useUser();

  // Live plan + daily-quota state, so the scan button reflects how many free
  // scans remain (and blocks at zero) before navigating to the results page.
  // Read from the server-owned entitlements doc (users/{uid}/entitlements/plan).
  const [ent, setEnt] = useState<Entitlements | null>(null);
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeEntitlements(user.uid, setEnt);
  }, [user?.uid]);
  const pro = isPro(ent);
  const remaining = scansRemaining(ent?.scanQuota, pro);
  const outOfScans = !pro && remaining <= 0;
  const [message, setMessage] = useState("");
  const [sourceChannel, setSourceChannel] = useState("WhatsApp");
  // Apply the user's preferred default channel once, when prefs first load —
  // but never override a channel the user has already picked this session.
  const channelTouched = useRef(false);
  useEffect(() => {
    if (defaultScanChannel && !channelTouched.current) {
      setSourceChannel(defaultScanChannel);
      channelTouched.current = true;
    }
  }, [defaultScanChannel]);
  const [senderContact, setSenderContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clipboardStatus, setClipboardStatus] = useState<"idle" | "reading" | "done" | "denied">("idle");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "reading" | "done">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Attached image for direct AI scanning (base64)
  const [attachedImage, setAttachedImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const canSubmit = message.trim().length > 0 && !isSubmitting && !outOfScans;

  // Shared file processor for upload, drag-drop, and clipboard paste
  async function processFile(file: File) {
    setUploadStatus("reading");
    try {
      if (file.type.startsWith("image/") || file.type === "application/pdf") {
        const base64 = await fileToBase64(file);
        setAttachedImage({ data: base64, mimeType: file.type });
        const label = file.type === "application/pdf" ? "[PDF attached for scanning]" : "[Screenshot attached for scanning]";
        setMessage((prev) => prev || label);
        setUploadStatus("done");
        setTimeout(() => setUploadStatus("idle"), 2000);
      } else if (file.type === "text/plain") {
        const text = await file.text();
        setMessage((prev) => (prev ? prev + "\n\n" + text : text));
        setUploadStatus("done");
        setTimeout(() => setUploadStatus("idle"), 2000);
      } else {
        setUploadStatus("idle");
      }
    } catch {
      setUploadStatus("idle");
    }
  }

  // Photo captured directly from the device camera
  function handleCameraCapture(image: { data: string; mimeType: string }) {
    setAttachedImage(image);
    setMessage((prev) => prev || "[Photo attached for scanning]");
    setUploadStatus("done");
    setTimeout(() => setUploadStatus("idle"), 2000);
  }

  async function handleClipboardPaste() {
    setClipboardStatus("reading");
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setMessage((prev) => (prev ? prev + "\n\n" + text : text));
        setClipboardStatus("done");
        setTimeout(() => setClipboardStatus("idle"), 2000);
      } else {
        setClipboardStatus("idle");
      }
    } catch {
      setClipboardStatus("denied");
      setTimeout(() => setClipboardStatus("idle"), 3000);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Handle paste — detects images/files in clipboard data
  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault(); // Prevent browser default paste behavior
        const file = item.getAsFile();
        if (file) processFile(file);
        return;
      }
    }
    // If no image found, let the default text paste happen naturally
  }

  // Drag-and-drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // Strip data:...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);

    try {
      const scanPayload: any = {
        message: message.trim(),
        sourceChannel,
        senderContact: senderContact.trim(),
      };

      // Attach image for direct AI visual scanning
      if (attachedImage) {
        scanPayload.image = attachedImage.data;
        scanPayload.imageMimeType = attachedImage.mimeType;
      }

      sessionStorage.setItem("guidr_scan_input", JSON.stringify(scanPayload));
      router.push("/scan/results");
    } catch (err) {
      logger.error("Scan error:", err);
      showToast("Couldn't start the scan. Please try again.", "error");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* ── Hero Banner ── */}
      <div className="-mx-5 bg-guidr-primary px-5 pt-safe-top pb-12 rounded-b-3xl relative overflow-hidden guidr-animate-in">
        {/* Shield-check watermark */}
        <svg
          aria-hidden="true"
          className="absolute right-1 top-1/2 -translate-y-1/2 text-white/15 pointer-events-none"
          width="140"
          height="140"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>

        <div className="relative pt-3">
          <h1 className="text-xl font-bold text-white leading-tight">
            Investigate a suspicious message
          </h1>
          <p className="text-sm text-white/80 mt-1.5 leading-snug max-w-[16rem]">
            Paste, upload, or photograph and we&apos;ll analyse it instantly
          </p>
        </div>
      </div>

      {/* ── Main Card: Message Box / Drop Zone ── */}
      <div
        className={`-mt-9 bg-white rounded-2xl shadow-sm overflow-hidden relative transition-all duration-200 guidr-animate-in guidr-stagger-1 ${
          isDragging ? "ring-2 ring-guidr-primary ring-offset-2" : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-guidr-primary/10 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-guidr-primary">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm font-bold text-guidr-primary">Drop file here to scan</p>
            <p className="text-[10px] text-guidr-muted">Images, PDFs, or text files</p>
          </div>
        )}

        <div className="p-4">
          {/* Message input box */}
          <div
            className={`rounded-xl border-2 p-3 transition-colors duration-200 ${
              message.trim().length > 0
                ? "border-guidr-primary/30 bg-guidr-primary-light/20"
                : "border-gray-200 bg-guidr-bg/50"
            }`}
          >
            <textarea
              id="scan-message-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={handlePaste}
              placeholder="Paste text, or paste/drop a screenshot or PDF here..."
              rows={5}
              className="
                w-full bg-transparent border-0 p-0
                text-sm text-guidr-text leading-relaxed
                placeholder:text-guidr-muted/70
                resize-none focus:outline-none
              "
            />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200/70">
              {message.trim().length > 0 ? (
                <span className="inline-flex items-center gap-1.5 bg-guidr-primary-light text-guidr-primary text-[11px] font-semibold px-2.5 py-1 rounded-md">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Message entered
                </span>
              ) : (
                <span className="text-[11px] font-medium text-guidr-muted">
                  Awaiting message
                </span>
              )}
              <span className="text-[11px] text-guidr-muted">
                {message.length} chars
              </span>
            </div>
          </div>

          {/* ── Attached Image Preview ── */}
          {attachedImage && (
            <div className="mt-3 relative inline-block">
              {attachedImage.mimeType === "application/pdf" ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span className="text-xs font-semibold text-red-700">PDF attached</span>
                </div>
              ) : (
                <img
                  src={`data:${attachedImage.mimeType};base64,${attachedImage.data}`}
                  alt="Attached screenshot"
                  className="max-h-32 rounded-xl border border-gray-200 shadow-sm"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  setAttachedImage(null);
                  setMessage((prev) =>
                    prev === "[Screenshot attached for scanning]" ||
                    prev === "[PDF attached for scanning]" ||
                    prev === "[Photo attached for scanning]"
                      ? ""
                      : prev
                  );
                }}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md hover:bg-red-600 transition-colors"
              >
                ✕
              </button>
              <p className="text-[10px] text-guidr-muted mt-1">File will be scanned by AI</p>
            </div>
          )}

          {/* ── Quick Actions: Paste / Upload / Photo ── */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            {/* Clipboard paste button */}
            <button
              type="button"
              onClick={handleClipboardPaste}
              disabled={clipboardStatus === "reading"}
              className="
                flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl
                bg-guidr-bg border border-gray-200
                text-[11px] font-semibold text-guidr-muted
                hover:border-guidr-primary/40 hover:text-guidr-primary hover:bg-guidr-primary-light/30
                transition-all duration-200 disabled:opacity-50
              "
            >
              {clipboardStatus === "reading" ? (
                <div className="w-5 h-5 border-2 border-guidr-primary/30 border-t-guidr-primary rounded-full animate-spin" />
              ) : clipboardStatus === "done" ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : clipboardStatus === "denied" ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e05252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
              {clipboardStatus === "done" ? "Pasted!" : clipboardStatus === "denied" ? "Denied" : "Paste"}
            </button>

            {/* File/screenshot upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadStatus === "reading"}
              className="
                flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl
                bg-guidr-bg border border-gray-200
                text-[11px] font-semibold text-guidr-muted
                hover:border-guidr-primary/40 hover:text-guidr-primary hover:bg-guidr-primary-light/30
                transition-all duration-200 disabled:opacity-50
              "
            >
              {uploadStatus === "reading" ? (
                <div className="w-5 h-5 border-2 border-guidr-primary/30 border-t-guidr-primary rounded-full animate-spin" />
              ) : uploadStatus === "done" ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
              {uploadStatus === "done" ? "Uploaded!" : "Upload"}
            </button>

            {/* Camera capture button */}
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              className="
                flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl
                bg-guidr-bg border border-gray-200
                text-[11px] font-semibold text-guidr-muted
                hover:border-guidr-primary/40 hover:text-guidr-primary hover:bg-guidr-primary-light/30
                transition-all duration-200
              "
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Photo
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* ── Step 2: Source Channel ── */}
      <div className="guidr-animate-in guidr-stagger-2">
        <div className="flex items-center gap-2.5 mb-3 px-1">
          <span className="bg-guidr-primary text-white text-[11px] font-bold px-2.5 py-1 rounded-md">
            Step 2
          </span>
          <h2 className="text-base font-bold text-guidr-text">
            Where did you receive this?
          </h2>
        </div>
        <ChannelPills
          selected={sourceChannel}
          onSelect={(ch) => {
            channelTouched.current = true;
            setSourceChannel(ch);
          }}
        />
      </div>

      {/* ── Sender Contact (Optional) ── */}
      <div className="guidr-animate-in guidr-stagger-3">
        <div className="flex items-center gap-2.5 mb-3 px-1">
          <span className="bg-gray-200 text-guidr-muted text-[11px] font-bold px-2.5 py-1 rounded-md">
            Optional
          </span>
          <h2 className="text-base font-bold text-guidr-text">
            Sender&apos;s contact
          </h2>
        </div>
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7b8794" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <input
            id="scan-sender-contact"
            type="text"
            value={senderContact}
            onChange={(e) => setSenderContact(e.target.value)}
            placeholder="Phone number, email, or username"
            className="
              w-full rounded-xl bg-white border border-gray-200
              pl-11 pr-4 py-3.5 text-sm text-guidr-text
              placeholder:text-guidr-muted/60
              focus:outline-none focus:ring-2 focus:ring-guidr-primary/30 focus:border-guidr-primary/40
              transition-all duration-200
            "
          />
        </div>
      </div>

      {/* ── Daily quota / upgrade banner (free tier only) ── */}
      {user && !pro && (
        outOfScans ? (
          <button
            type="button"
            onClick={() => router.push("/settings?upgrade=1")}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-left guidr-animate-in guidr-stagger-3 active:scale-[0.99] transition-all"
          >
            <span className="flex items-center gap-2.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span className="text-xs text-amber-900 leading-snug">
                <strong className="font-bold">Daily scan limit reached.</strong> Upgrade to Guidr Pro for unlimited scans.
              </span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <p className="text-center text-[11px] text-guidr-muted guidr-animate-in guidr-stagger-3">
            {remaining} of {FREE_DAILY_SCANS} free scans left today ·{" "}
            <button
              type="button"
              onClick={() => router.push("/settings?upgrade=1")}
              className="text-guidr-primary font-semibold hover:underline"
            >
              Go unlimited with Pro
            </button>
          </p>
        )
      )}

      {/* ── CTA Button ── */}
      <div className="pt-1 guidr-animate-in guidr-stagger-4">
        <button
          id="scan-start-investigation"
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`
            relative w-full flex items-center justify-center gap-2.5
            py-4 px-6 rounded-xl
            font-semibold text-base
            transition-all duration-200 ease-out
            ${
              canSubmit
                ? "bg-guidr-primary text-white shadow-lg shadow-guidr-primary/25 hover:bg-guidr-primary-dark active:scale-[0.98]"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }
          `}
        >
          {isSubmitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Investigating...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Start investigation
              {canSubmit && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute right-5">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              )}
            </>
          )}
        </button>
      </div>

      {/* ── Privacy Notice ── */}
      <div className="guidr-animate-in guidr-stagger-5">
        <div className="flex items-start gap-2 px-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7b8794" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p className="text-xs text-guidr-muted leading-relaxed">
            Your message stays private. Verified via Google Safe Browsing &amp; live
            web intelligence. No data is permanently stored.
          </p>
        </div>
      </div>

      {/* ── Camera Capture Modal ── */}
      {isCameraOpen && (
        <CameraCapture
          isOpen
          onClose={() => setIsCameraOpen(false)}
          onCapture={handleCameraCapture}
        />
      )}
    </div>
  );
}
