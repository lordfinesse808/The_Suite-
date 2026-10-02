import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { tick } from "@/lib/jobs/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called every minute by Supabase pg_cron + pg_net with the shared secret.
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env().tickSecret}`)) return new Response("Unauthorized", { status: 401 });
  const scan = new URL(req.url).searchParams.get("scan") === "1";
  const r = await tick({ scan });
  return Response.json(r);
}
