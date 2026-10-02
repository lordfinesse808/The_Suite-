// Tenant isolation: application scoping (first wall) and Postgres RLS (second wall).
import { beforeAll, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { getDb, rows } from "@/lib/db/client";
import { DEMO } from "@/lib/db/seed";
import { getLead, getListingByRef } from "@/lib/repo";
import { searchListings } from "@/lib/agents/matchmaker";
import { setup, chat } from "./helpers";

let ids: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ids = await setup();
});

describe("tenant isolation", () => {
  test("repo functions never return another org's rows", async () => {
    const db = await getDb();
    const [otherLead] = await db.select().from(s.leads).where(eq(s.leads.org_id, ids.otherOrgId));
    expect(await getLead(ids.orgId, otherLead.id)).toBeNull();
    expect(await getListingByRef(ids.orgId, "LST-9001")).toBeNull();
    const found = await searchListings(ids.orgId, { purpose: "sale", areas: ["Ikoyi"] }, { relaxed: true, limit: 50 });
    expect(found.every((r) => r.listing.org_id === ids.orgId)).toBe(true);
  });

  test("webhooks route to the org that owns the phone number", async () => {
    const a = await chat("+2348051112222", { text: "Hello" }, { phoneNumberId: DEMO.phoneNumberId });
    const b = await chat("+2348051112222", { text: "Hello" }, { phoneNumberId: DEMO.otherOrgPhoneNumberId });
    expect(a.lead!.org_id).toBe(ids.orgId);
    expect(b.lead!.org_id).toBe(ids.otherOrgId);
    expect(a.lead!.id).not.toBe(b.lead!.id);
  });

  test("RLS fails closed for the app role", async () => {
    const db = await getDb();
    const q = async (orgId: string | null, query: ReturnType<typeof sql>) => {
      await db.execute(sql`begin`);
      try {
        await db.execute(sql`set local role app_user`);
        if (orgId) await db.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
        return rows<Record<string, unknown>>(await db.execute(query));
      } finally {
        await db.execute(sql`rollback`);
      }
    };
    const mine = await q(ids.orgId, sql`select distinct org_id from leads`);
    expect(mine.map((r) => r.org_id)).toEqual([ids.orgId]);
    const none = await q(null, sql`select count(*)::int as n from leads`);
    expect(none[0].n).toBe(0);
    const other = await q(ids.otherOrgId, sql`select count(*)::int as n from listings`);
    expect(other[0].n).toBe(2);
    await expect(q(ids.orgId, sql`insert into listings (org_id, ref_code, title, purpose, property_type, price_amount, price_period, area, city) values (${ids.otherOrgId}, 'LST-X', 'x', 'rent', 'flat', 1, 'year', 'Ikoyi', 'Lagos')`)).rejects.toThrow();
  });
});
