// LLM_MODE=live: Claude Haiku 4.5 for both steps, prompt caching on, 300-token reply cap.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { understandingSchema, understandRules, type Understanding } from "../agents/understand";
import { env } from "../env";
import { PROMPT_VERSION, UNDERSTAND_SYSTEM, respondSystem } from "./prompts";
import { assertBudget, recordRun } from "./budget";
import type { LLM, RespondInput, UnderstandInput } from "./types";

// USD per million tokens (Claude Haiku 4.5).
const PRICE = { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 };

export function costUsd(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  return (
    (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) /
    1_000_000
  );
}

export class AnthropicLLM implements LLM {
  readonly mode = "live" as const;
  private client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY || undefined, maxRetries: 1, timeout: 20_000 });
  private model = env().CLAUDE_MODEL_FAST;

  async understand(i: UnderstandInput): Promise<Understanding> {
    const rules = understandRules(i.text, { ref: i.ref, replyId: i.replyId, lastOffer: i.lastOffer });
    // Interactive replies and STOP are deterministic; no need to spend tokens.
    if (i.replyId || rules.intent === "opt_out" || rules.intent === "opt_in") return rules;
    await assertBudget(i.orgId);
    const started = Date.now();
    try {
      const res = await this.client.messages.parse({
        model: this.model,
        max_tokens: 600,
        system: [{ type: "text", text: UNDERSTAND_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          content: `Reference date: ${i.ref.toISOString().slice(0, 10)}\nLast thing we offered: ${i.lastOffer ?? "nothing"}\nKnown needs: ${JSON.stringify(i.needs)}\nRecent chat:\n${i.history.slice(-6).map((h) => `${h.role}: ${h.text}`).join("\n")}\n\n<lead_message>\n${i.text}\n</lead_message>`,
        }],
        output_config: { format: zodOutputFormat(understandingSchema) },
      });
      await recordRun({ orgId: i.orgId, leadId: i.leadId, agent: "orchestrator", step: "understand", model: this.model, promptVersion: PROMPT_VERSION, usage: res.usage, costUsd: costUsd(res.usage), latencyMs: Date.now() - started });
      const parsed = res.parsed_output;
      if (!parsed) return rules;
      // Deterministic signals always win (scam patterns, listing refs, injection).
      return {
        ...parsed,
        listing_ref: parsed.listing_ref ?? rules.listing_ref,
        scam_signals: [...new Set([...(parsed.scam_signals ?? []), ...rules.scam_signals])],
        injection: parsed.injection || rules.injection,
      };
    } catch (e) {
      if (e instanceof Anthropic.APIError) console.error("[llm] understand failed, using rules", e.status, e.message);
      else throw e;
      return rules;
    }
  }

  async respond(i: RespondInput): Promise<string> {
    await assertBudget(i.orgId);
    const started = Date.now();
    const { plan } = i;
    const facts = {
      language: plan.language,
      lead_name: plan.leadName ?? null,
      time_of_day: plan.daypart,
      first_reply_must_include_consent: plan.requireConsent,
      moves: plan.moves,
    };
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 300,
      system: [{ type: "text", text: respondSystem(plan.orgProfile ? { name: plan.orgName, ...plan.orgProfile } : { name: plan.orgName, tone: "", feesPolicy: "", areas: [], officeHours: "" }), cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content:
          `Chat so far (oldest first):\n${i.history.slice(-10).map((h) => `${h.role}: ${h.text}`).join("\n") || "(none)"}\n\n` +
          `Sentences you must not repeat:\n${i.previousAi.slice(-10).join("\n") || "(none)"}\n\n` +
          `PLAN (facts are authoritative):\n${JSON.stringify(facts)}\n\n` +
          (plan.requireConsent ? "This is the first reply: say naturally that their details will be saved to help with the search and that they can reply STOP at any time.\n" : "") +
          (i.attempt > 0 ? "Your previous draft failed a check. Use different wording, no exclamation marks, and only the prices in the plan.\n" : "") +
          "Write the reply now.",
      }],
    });
    await recordRun({ orgId: i.orgId, leadId: i.leadId, agent: plan.agent, step: "respond", model: this.model, promptVersion: PROMPT_VERSION, usage: res.usage, costUsd: costUsd(res.usage), latencyMs: Date.now() - started });
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  }
}
