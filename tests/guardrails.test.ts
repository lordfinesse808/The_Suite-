import { describe, expect, test } from "vitest";
import { checkReply, hasConsent, repeatedSentence, sanitize } from "@/lib/agents/guardrails";
import { scoreLead, isQualified, missingFields } from "@/lib/agents/scoring";
import { composeReply } from "@/lib/llm/mock";
import type { ReplyPlan } from "@/lib/llm";

describe("guardrails", () => {
  const ctx = { allowedAmounts: [5_500_000], previousAi: [], requireConsent: false };
  test("tone rules", () => {
    expect(checkReply("Great news! It is available 😊", ctx).problems).toEqual(expect.arrayContaining(["emoji", "exclamation"]));
    expect(checkReply("Is it rent? Is it buy? Which area?", ctx).problems).toContain("too_many_questions");
    expect(sanitize("Hello! Nice 😊")).toBe("Hello. Nice");
  });
  test("invented prices are caught, listed prices pass", () => {
    expect(checkReply("The Ikate flat is ₦5,500,000 / yr.", ctx).ok).toBe(true);
    expect(checkReply("The Ikate flat is ₦5,000,000 a year.", ctx).problems).toContain("invented_price:5000000");
    expect(checkReply("It costs about 7m.", ctx).problems).toContain("invented_price:7000000");
  });
  test("repetition and consent", () => {
    expect(repeatedSentence("Which areas are you considering? Thanks.", ["Hello. Which areas are you considering?"])).toBeTruthy();
    expect(hasConsent("We'll save your details to help with your search, and you can reply STOP at any time.")).toBe(true);
    expect(hasConsent("We go keep your details to help your search, and you fit reply STOP any time.")).toBe(true);
    expect(hasConsent("Reply STOP to opt out.")).toBe(false);
  });
  test("legal promises and phone numbers", () => {
    expect(checkReply("The title is clean, guaranteed.", ctx).problems).toContain("legal_promise");
    expect(checkReply("Call me on 0803 123 4567", ctx).problems).toContain("phone_number");
  });
});

describe("mock composer", () => {
  const plan: ReplyPlan = {
    agent: "qualifier", language: "en-NG", orgName: "Adaeze Homes", leadName: null, daypart: "evening", allowedAmounts: [], requireConsent: true,
    moves: [{ k: "greet" }, { k: "intro" }, { k: "consent" }, { k: "ask", fields: ["purpose", "budget"] }],
    orgProfile: { tone: "", feesPolicy: "", areas: [], officeHours: "" },
  };
  test("first reply passes every check in both languages", () => {
    for (const language of ["en-NG", "pcm"] as const) {
      for (let i = 0; i < 20; i++) {
        const text = composeReply({ ...plan, language }, { previousAi: [], attempt: 0, seed: `lead-${i}` });
        expect(checkReply(text, { allowedAmounts: [], previousAi: [], requireConsent: true }).problems).toEqual([]);
      }
    }
  });
  test("avoids sentences already sent", () => {
    const first = composeReply({ ...plan, moves: [{ k: "ask", fields: ["area"] }] }, { previousAi: [], attempt: 0, seed: "x" });
    const second = composeReply({ ...plan, moves: [{ k: "ask", fields: ["area"] }] }, { previousAi: [first], attempt: 0, seed: "x" });
    expect(second).not.toBe(first);
  });
});

describe("scoring", () => {
  const ref = new Date("2026-10-02T10:00:00Z");
  test("hot lead", () => {
    const r = scoreLead({ needs: { purpose: "rent", budget_max: 6e6, areas: ["Ikate"], bedrooms_min: 3, move_in_by: "2026-11-15" }, name: "Chiamaka", inboundCount: 3, fromListing: true, fittingListings: 4, ref });
    expect(r.score).toBe(100);
    expect(r.temperature).toBe("hot");
  });
  test("cold lead and spam penalty", () => {
    expect(scoreLead({ needs: {}, inboundCount: 1, fromListing: false, fittingListings: 0, ref }).temperature).toBe("cold");
    expect(scoreLead({ needs: { purpose: "rent", budget_max: 1e6, areas: ["Ikoyi"], bedrooms_min: 3 }, inboundCount: 2, fromListing: false, fittingListings: 0, spam: true, ref }).score).toBe(0);
  });
  test("hand-off rule", () => {
    expect(isQualified({ purpose: "rent", budget_max: 1, areas: ["Yaba"], bedrooms_min: 1 })).toBe(true);
    expect(isQualified({ purpose: "rent", areas: ["Yaba"], bedrooms_min: 1 })).toBe(false);
    expect(missingFields({ purpose: "shortlet" })).toEqual(["area", "budget", "type_bedrooms"]);
  });
});
