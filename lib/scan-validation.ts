import type { ScanInput } from "@/lib/scan-types";

export const MAX_MESSAGE_CHARS = 20_000;
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type ValidationResult =
  | { ok: true; input: ScanInput }
  | { ok: false; error: string };

function base64Bytes(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/=+$/, "");
  return Math.floor((normalized.length * 3) / 4);
}

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function validateScanInput(value: unknown): ValidationResult {
  if (!value || typeof value !== "object") return { ok: false, error: "Please provide a message or supported attachment." };
  const candidate = value as Partial<ScanInput>;
  const message = safeText(candidate.message, MAX_MESSAGE_CHARS);
  const sourceChannel = safeText(candidate.sourceChannel, 80) || "Other";
  const senderContact = safeText(candidate.senderContact, 250) || undefined;
  const image = typeof candidate.image === "string" ? candidate.image.replace(/\s/g, "") : undefined;
  const imageMimeType = safeText(candidate.imageMimeType, 100).toLowerCase() || undefined;
  const attachmentName = safeText(candidate.attachmentName, 160) || undefined;

  if (!message && !image) return { ok: false, error: "Add a message, screenshot, or PDF to scan." };
  if (typeof candidate.message === "string" && candidate.message.length > MAX_MESSAGE_CHARS) return { ok: false, error: "Messages can be up to 20,000 characters." };
  if (image && (!imageMimeType || !ALLOWED_ATTACHMENT_TYPES.has(imageMimeType))) return { ok: false, error: "Use a PNG, JPG, WebP, or PDF attachment." };
  if (image && base64Bytes(image) > MAX_ATTACHMENT_BYTES) return { ok: false, error: "Attachments can be up to 3 MB." };
  if (image && !/^[A-Za-z0-9+/]*={0,2}$/.test(image)) return { ok: false, error: "The attachment could not be read. Please try uploading it again." };

  return { ok: true, input: { message, sourceChannel, senderContact, image, imageMimeType, attachmentName } };
}
