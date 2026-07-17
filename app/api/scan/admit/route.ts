import { admit } from "@/app/api/lib/scan-queue";
export async function POST(request: Request) { const { ticketId } = await request.json(); return Response.json(admit(ticketId, request.headers.get("x-guidr-user") || "anonymous")); }
