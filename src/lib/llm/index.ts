import { env } from "../env";
import { MockLLM } from "./mock";
import type { LLM } from "./types";

let inst: LLM | null = null;
export async function llm(): Promise<LLM> {
  if (inst && process.env.NODE_ENV !== "test") return inst;
  if (env().LLM_MODE === "live") {
    const { AnthropicLLM } = await import("./anthropic");
    inst = new AnthropicLLM();
  } else {
    inst = new MockLLM();
  }
  return inst;
}
export * from "./types";
