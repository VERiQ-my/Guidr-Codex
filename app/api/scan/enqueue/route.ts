import { enqueue } from "@/app/api/lib/scan-queue";
export async function POST(request: Request) { const userId = request.headers.get("x-guidr-user") || "anonymous"; return Response.json({ ticketId: enqueue(userId) }); }
