// The $10 guard: when the daily cap is reached the AI pauses and leads get a holding reply.
import { beforeAll, expect, test, vi } from "vitest";
import { BudgetExceededError } from "@/lib/llm/types";

vi.mock("@/lib/llm/mock", async (orig) => {
  const real = await orig<typeof import("@/lib/llm/mock")>();
  class Broke extends real.MockLLM {
    async respond(): Promise<string> {
      throw new BudgetExceededError(0.51, 0.5);
    }
  }
  return { ...real, MockLLM: Broke };
});

import { assertBudget, recordRun } from "@/lib/llm/budget";
import { setup, chat } from "./helpers";

let ids: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ids = await setup();
});

test("assertBudget throws once the cap is spent", async () => {
  await expect(assertBudget(ids.orgId)).resolves.toBeUndefined();
  await recordRun({ orgId: ids.orgId, leadId: null, agent: "qualifier", step: "respond", model: "claude-haiku-4-5", promptVersion: "t", usage: { input_tokens: 1000, output_tokens: 100 }, costUsd: 0.6, latencyMs: 1 });
  await expect(assertBudget(ids.orgId)).rejects.toBeInstanceOf(BudgetExceededError);
});

test("over budget: holding reply with consent, lead flagged", async () => {
  const r = await chat("+2348077777777", { text: "Hello, 2 bed in Yaba" });
  expect(r.out).toHaveLength(1);
  expect(r.out[0].body).toMatch(/agent will/i);
  expect(r.out[0].body).toMatch(/STOP/);
  expect(r.lead!.needs_human).toBe(true);
});
