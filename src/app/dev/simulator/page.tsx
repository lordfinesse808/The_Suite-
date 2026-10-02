import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { Simulator } from "./simulator";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp simulator" };

export default async function SimulatorPage() {
  if (!env().MOCK_WHATSAPP) notFound();
  const db = await getDb();
  const accounts = await db
    .select({ pnid: s.whatsappAccounts.phone_number_id, name: s.organisations.name, display: s.whatsappAccounts.display_number })
    .from(s.whatsappAccounts)
    .innerJoin(s.organisations, eq(s.organisations.id, s.whatsappAccounts.org_id));
  return <Simulator accounts={accounts} />;
}
