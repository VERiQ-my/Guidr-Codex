import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DISABLED (2026-07-04, security review F-2).
 *
 * This OCR endpoint has no callers anywhere in the app — the scan flow sends
 * screenshots directly to the scan agent (/api/scan/run accepts image +
 * imageMimeType) — yet every call here invoked paid Vertex AI. Dead code with
 * a billing surface, so it is switched off rather than maintained.
 *
 * The full implementation is preserved (commented) below. If it is ever
 * revived, keep the auth + rate-limit + input-validation guards intact.
 */
export async function POST() {
  return NextResponse.json({ error: "gone" }, { status: 410 });
}

// import { NextRequest, NextResponse } from "next/server";
// import { ai, MODEL_ID } from "../lib/ai-client";
// import { verifyRequest, checkRateLimit } from "../lib/admin";
//
// // Base64 payload cap (~7.5 MB of raw image). Real screenshots are far below
// // this; the cap bounds the per-call Vertex cost without touching legit use.
// const MAX_IMAGE_BASE64_CHARS = 10_000_000;
//
// /**
//  * Extracts text from a screenshot using Vertex AI.
//  * Used when users upload a screenshot of a suspicious message.
//  */
// export async function POST(req: NextRequest) {
//   // Same auth posture as the scan routes: every call must carry a Firebase ID
//   // token in production; anonymous is tolerated in dev so local testing works.
//   const uid = await verifyRequest(req.headers.get("authorization"));
//   if (!uid && process.env.NODE_ENV === "production") {
//     return NextResponse.json({ error: "unauthorized" }, { status: 401 });
//   }
//   const limitKey = uid || "dev-anonymous";
//   const allowed = await checkRateLimit(`extract-text:${limitKey}`, 10, 60_000);
//   if (!allowed) {
//     return NextResponse.json({ error: "rate_limited" }, { status: 429 });
//   }
//
//   try {
//     const { image, mimeType } = await req.json();
//
//     if (typeof image !== "string" || !image || typeof mimeType !== "string" || !mimeType) {
//       return NextResponse.json({ error: "Missing image or mimeType" }, { status: 400 });
//     }
//     if (!/^image\/[a-z0-9.+-]{1,30}$/i.test(mimeType)) {
//       return NextResponse.json({ error: "Unsupported mimeType" }, { status: 400 });
//     }
//     if (image.length > MAX_IMAGE_BASE64_CHARS) {
//       return NextResponse.json({ error: "Image too large" }, { status: 413 });
//     }
//
//     const response = await ai.models.generateContent({
//       model: MODEL_ID,
//       contents: [
//         {
//           role: "user",
//           parts: [
//             {
//               inlineData: {
//                 data: image,
//                 mimeType: mimeType,
//               }
//             },
//             {
//               text: `Extract ALL text visible in this screenshot. This appears to be a screenshot of a message (e.g., WhatsApp, SMS, email, social media).
//
// Rules:
// - Extract the EXACT text as-is, preserving the original language
// - Include sender names, timestamps, URLs, phone numbers, and any other visible text
// - Do NOT add any commentary, analysis, or interpretation
// - Do NOT translate any text
// - If there are multiple messages, separate them with line breaks
// - Return ONLY the raw extracted text, nothing else`
//             }
//           ]
//         }
//       ]
//     });
//
//     return NextResponse.json({ text: response.text || "" });
//   } catch (error: any) {
//     const errorId = crypto.randomUUID();
//     console.error(`[Extract Text Error errorId=${errorId}]`, error);
//     return NextResponse.json(
//       { error: "Failed to extract text from image", errorId },
//       { status: 500 }
//     );
//   }
// }
