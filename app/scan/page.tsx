import { ShieldCheck, Sparkles } from "lucide-react";
import ScanForm from "./ScanForm";

export default function ScanPage() {
  return (
    <main className="scan-page min-h-full pb-safe">
      <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7 sm:py-12">
        <div className="guidr-animate-in max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="scan-eyebrow"><ShieldCheck size={14} />Private message check</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-guidr-muted"><Sparkles size={14} className="text-guidr-primary" />Usually under 2 minutes</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-guidr-text sm:text-4xl">Take a moment before you respond.</h1>
          <p className="mt-3 max-w-lg text-[15px] leading-6 text-guidr-muted">Share a suspicious message, link, or screenshot. We will help you spot the signs and choose a safer next step.</p>
        </div>
        <div className="mt-8 guidr-animate-in guidr-stagger-2"><ScanForm /></div>
      </div>
    </main>
  );
}