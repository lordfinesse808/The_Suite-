import { env } from "@/lib/env";

/** Dev endpoints exist only in mock mode. */
export function devOnly(): Response | null {
  if (!env().MOCK_WHATSAPP) return new Response("Not found", { status: 404 });
  return null;
}
