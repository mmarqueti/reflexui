import type { Answer, Decider, EvaluateRequest, EvaluateResult, Question } from "@reflexui-jev/core";

const planned = (name: string, milestone: string): Decider => ({
  name,
  async evaluate() {
    throw new Error(`${name} decider: not implemented yet (${milestone})`);
  },
});

export interface TypeSafeOptions {
  apiKey?: string; // defaults to process.env.TYPESAFE_API_KEY
  model?: string; // defaults to "jev-latest"; pin it in production, e.g. "jev-1.13.0"
  baseUrl?: string; // defaults to https://api.typesafe.ai
  /** Retries on 429/529/network errors, with exponential backoff. Default 2. */
  maxRetries?: number;
  fetch?: typeof fetch;
}

type WireAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities?: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities?: Record<string, number> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toWireQuestion(q: Question) {
  if (q.type === "score") return { type: "score", instructions: q.prompt, criteria: [...q.levels] };
  if (q.type === "choice") return { type: "choice", instructions: q.prompt, criteria: q.options };
  return { type: "noul", instructions: q.prompt };
}

function fromWireAnswer(key: string, a: WireAnswer): Answer {
  if (a.type === "noul") return { type: "noul", probability: a.noul };
  if (a.type === "choice") {
    return { type: "choice", choice: a.choice, confidence: a.confidence, probabilities: a.probabilities };
  }
  if (a.type === "score") return { type: "score", score: a.score, confidence: a.confidence };
  throw new Error(`typesafe: unexpected answer type for "${key}"`);
}

/** Jev through TypeSafe's HTTP API (POST /v1/systemone). No SDK dependency. */
export function typesafeDecider(options: TypeSafeOptions = {}): Decider {
  const model = options.model ?? "jev-latest";
  const baseUrl = (options.baseUrl ?? "https://api.typesafe.ai").replace(/\/$/, "");
  const maxRetries = options.maxRetries ?? 2;
  return {
    name: `typesafe/${model}`,
    async evaluate({ state, questions, signal }: EvaluateRequest): Promise<EvaluateResult> {
      const apiKey = options.apiKey ?? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.TYPESAFE_API_KEY;
      if (!apiKey) throw new Error("typesafe decider: missing TYPESAFE_API_KEY");
      const doFetch = options.fetch ?? fetch;
      const body = JSON.stringify({
        model,
        state,
        questions: Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, toWireQuestion(q)])),
      });
      const started = Date.now();
      for (let attempt = 0; ; attempt++) {
        let res: Response | undefined;
        try {
          res = await doFetch(`${baseUrl}/v1/systemone`, {
            method: "POST",
            headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
            body,
            signal,
          });
        } catch (e) {
          if (signal?.aborted || attempt >= maxRetries) throw e;
        }
        if (res?.ok) {
          const json = (await res.json()) as {
            model: string;
            answers: Record<string, WireAnswer>;
            usage?: { input_tokens: number };
          };
          return {
            answers: Object.fromEntries(Object.entries(json.answers).map(([k, a]) => [k, fromWireAnswer(k, a)])),
            usage: json.usage ? { inputTokens: json.usage.input_tokens } : undefined,
            latencyMs: Date.now() - started,
            model: json.model,
          };
        }
        const retryable = res !== undefined && (res.status === 429 || res.status === 529);
        if (res && (!retryable || attempt >= maxRetries)) {
          throw new Error(`typesafe ${res.status}: ${(await res.text()).slice(0, 300)}`);
        }
        if (attempt >= maxRetries) throw new Error("typesafe: request failed");
        await sleep(250 * 2 ** attempt);
      }
    },
  };
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
