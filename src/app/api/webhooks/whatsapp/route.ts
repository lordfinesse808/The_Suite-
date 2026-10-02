import { after } from "next/server";
import { env } from "@/lib/env";
import { receiveWebhook } from "@/lib/webhook";
import { drainLead } from "@/lib/jobs/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Meta verification handshake
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === env().verifyToken) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Return 200 at once; process after the response (the job tick is the safety net).
export async function POST(req: Request) {
  const raw = await req.text();
  const res = await receiveWebhook(raw, req.headers.get("x-hub-signature-256"));
  if (res.status !== 200) return new Response(res.status === 401 ? "Bad signature" : "Bad request", { status: res.status });
  const leads = [...new Set(res.stored.map((s) => s.leadId))];
  if (leads.length) {
    after(async () => {
      for (const id of leads) {
        try {
          await drainLead(id);
        } catch (e) {
          console.error("[webhook] processing failed; the job will retry on the next tick", e);
        }
      }
    });
  }
  return new Response("OK", { status: 200 });
}
