import type { Decider } from "@reflexui-jev/core";

const planned = (name: string, milestone: string): Decider => ({
  name,
  async evaluate() {
    throw new Error(`${name} decider: not implemented yet (${milestone})`);
  },
});

export interface TypeSafeOptions {
  apiKey?: string; // defaults to process.env.TYPESAFE_API_KEY
  model?: string; // defaults to "jev"
}

/** Jev through TypeSafe's own API / SDK (@typesafe-ai/sdk). */
export function typesafeDecider(_options: TypeSafeOptions = {}): Decider {
  return planned("typesafe", "milestone M0");
}

export interface CloudflareOptions {
  accountId?: string;
  apiToken?: string;
  model?: string; // defaults to "typesafe/jev"
}

/** Jev through Cloudflare Workers AI (zero data retention). */
export function cloudflareDecider(_options: CloudflareOptions = {}): Decider {
  return planned("cloudflare", "milestone M0");
}

export interface OpenRouterOptions {
  apiKey?: string;
  model?: string; // defaults to "typesafe/jev-1.13"
}

/** Jev through OpenRouter's Decisions API. */
export function openrouterDecider(_options: OpenRouterOptions = {}): Decider {
  return planned("openrouter", "milestone M1");
}

export interface LlmOptions {
  /** Any function that returns JSON for a prompt + JSON schema. */
  generateObject: (args: { prompt: string; schema: unknown }) => Promise<unknown>;
}

/**
 * Fallback for teams without Jev access: maps typed questions to a structured
 * LLM call. Slower and without calibrated confidence; useful for development.
 */
export function llmDecider(_options: LlmOptions): Decider {
  return planned("llm", "milestone M1");
}
