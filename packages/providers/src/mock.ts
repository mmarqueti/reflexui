import type { Answer, Decider, EvaluateRequest, EvaluateResult } from "@reflexui-jev/core";

/** Stable pseudo-random number in [0, 1) from a string. */
function hash01(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export interface MockDeciderOptions {
  /** Force answers for specific question keys (useful in tests and scripted demos). */
  overrides?: Record<string, Answer>;
  latencyMs?: number;
}

/**
 * Deterministic decider: same state + question -> same answer.
 * Lets the examples and tests run without any API key.
 */
export function mockDecider(options: MockDeciderOptions = {}): Decider {
  return {
    name: "mock",
    async evaluate({ state, questions }: EvaluateRequest): Promise<EvaluateResult> {
      if (options.latencyMs) await new Promise((r) => setTimeout(r, options.latencyMs));
      const seed = JSON.stringify(state);
      const answers: Record<string, Answer> = {};
      for (const [key, q] of Object.entries(questions)) {
        const forced = options.overrides?.[key];
        if (forced) {
          answers[key] = forced;
          continue;
        }
        const r = hash01(seed + key);
        if (q.type === "score") {
          answers[key] = { type: "score", score: r * (q.levels.length - 1), confidence: 0.5 + r / 2 };
        } else if (q.type === "choice") {
          const names = Object.keys(q.options);
          const choice = names.at(Math.floor(r * names.length)) ?? names[0] ?? "";
          answers[key] = { type: "choice", choice, confidence: 0.5 + r / 2 };
        } else {
          answers[key] = { type: "noul", probability: r };
        }
      }
      return { answers, model: "mock", latencyMs: options.latencyMs ?? 0 };
    },
  };
}
