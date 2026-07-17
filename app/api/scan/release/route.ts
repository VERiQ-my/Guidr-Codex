import { release } from "@/app/api/lib/scan-queue";
export async function POST(request: Request) { const { slotToken } = await request.json().catch(() => ({})); release(slotToken); return new Response(null, { status: 204 }); }
