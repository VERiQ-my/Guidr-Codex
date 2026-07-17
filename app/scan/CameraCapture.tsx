"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CamStatus = "starting" | "live" | "denied" | "error";

interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  /** Returns the captured photo as base64 (no data URI prefix) plus its mime type. */
  onCapture: (image: { data: string; mimeType: string }) => void;
}

export default function CameraCapture({ isOpen, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CamStatus>("starting");
  const [errorMsg, setErrorMsg] = useState("");
  // Bumped by the "Try again" button to re-run the camera-start effect.
  const [retryNonce, setRetryNonce] = useState(0);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Start the camera while open; stop it on close/unmount. setState happens only
  // after the async getUserMedia boundary, never synchronously in the effect body.
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus("live");
      } catch (err) {
        if (!active) return;
        const name = (err as DOMException)?.name;
        if (name === "NotAllowedError" || name === "SecurityError") {
          setStatus("denied");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setStatus("error");
          setErrorMsg("No camera was found on this device.");
        } else if (!navigator.mediaDevices?.getUserMedia) {
          setStatus("error");
          setErrorMsg("Camera is not supported on this device or browser.");
        } else {
          setStatus("error");
          setErrorMsg("Couldn't access the camera. Please try again.");
        }
      }
    })();

    return () => {
      active = false;
      stopStream();
    };
  }, [isOpen, retryNonce, stopStream]);

  function handleCapture() {
    const video = videoRef.current;
    if (!video || status !== "live") return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];
    if (!base64) return;

    onCapture({ data: base64, mimeType: "image/jpeg" });
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-[guidr-fade-in_0.2s_ease-out]"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md mx-auto bg-black sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[100dvh] sm:h-auto animate-[guidr-scale-in_0.25s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-5 py-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] bg-gradient-to-b from-black/60 to-transparent">
          <span className="text-sm font-semibold text-white">Snap a photo to scan</span>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 transition-colors"
            aria-label="Close camera"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Video / states */}
        <div className="relative flex-1 sm:aspect-[3/4] bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${status === "live" ? "opacity-100" : "opacity-0"}`}
          />

          {status === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <p className="text-sm">Starting camera…</p>
            </div>
          )}

          {(status === "denied" || status === "error") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-white/90">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              <p className="text-sm font-semibold">
                {status === "denied" ? "Camera access blocked" : "Camera unavailable"}
              </p>
              <p className="text-xs text-white/60 leading-relaxed">
                {status === "denied"
                  ? "Allow camera access in your browser settings, then try again."
                  : errorMsg}
              </p>
              <button
                type="button"
                onClick={() => {
                  setStatus("starting");
                  setErrorMsg("");
                  setRetryNonce((n) => n + 1);
                }}
                className="mt-1 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-medium transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Capture controls */}
        <div className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-center pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] bg-gradient-to-t from-black/60 to-transparent">
          <button
            type="button"
            onClick={handleCapture}
            disabled={status !== "live"}
            aria-label="Take photo"
            className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg ring-4 ring-white/30 transition-transform active:scale-95 disabled:opacity-40 disabled:active:scale-100"
          >
            <span className="w-12 h-12 rounded-full border-2 border-guidr-primary/40 bg-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
