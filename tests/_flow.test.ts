import { test } from "vitest";
import { setup, chat } from "./helpers";
test("print a conversation", async () => {
  await setup();
  const p = "+2348030000001";
  for (const m of ["Good evening. I saw the 3-bed in Lekki on your Instagram. Is it still available?", "Rent. My budget is around 6m a year, Lekki Phase 1 or Ikate. I want to move by December.", "The Ikate one. Can I see it this weekend?"]) {
    const r = await chat(p, { text: m }, { name: "Chiamaka" });
    console.log("LEAD:", m);
    for (const o of r.out) console.log(`  ${o.author} [${o.type}]: ${o.body.replace(/\n/g, " | ")}`);
    console.log("  -> stage", r.lead?.stage, "score", r.lead?.score, JSON.stringify(r.lead?.needs));
  }
  const r = await chat(p, { reply: "slot:1" });
  for (const o of r.out) console.log(`  ${o.author} [${o.type}]: ${o.body.replace(/\n/g, " | ")}`);
  console.log("  -> stage", r.lead?.stage);
});
