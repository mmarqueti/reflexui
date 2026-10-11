import type { Decision } from "./types";
import type { DecideResult, DecideTrace } from "./decide";

/** One NDJSON line of the decision stream. */
export type DecisionStreamMessage =
  | { type: "immediate"; decision: Decision }
  | { type: "fresh"; decision: Decision }
  /** Only sent when `decisionStream(..., { trace: true })`: raw model I/O, for debug panels. */
  | { type: "trace"; trace: DecideTrace };

export interface DecisionStreamOptions {
  /**
   * Also send the full trace (scoreboard, requests, answers, facts) after the fresh decision.
   * The requests contain the signals you send to the model, which may be customer data:
   * enable it in development or behind an admin check, never for end users.
   */
  trace?: boolean;
}

/**
 * Turns a `decide()` result into an NDJSON `ReadableStream`: the immediate decision is sent at once,
 * the fresh one when the model answers. Return it from any route handler:
 * `new Response(decisionStream(await decide(...)), { headers: { "content-type": "application/x-ndjson" } })`.
 */
export function decisionStream(result: DecideResult, options: DecisionStreamOptions = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const line = (m: DecisionStreamMessage) => enc.encode(JSON.stringify(m) + "\n");
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(line({ type: "immediate", decision: result.immediate }));
      try {
        controller.enqueue(line({ type: "fresh", decision: await result.fresh }));
        if (options.trace) controller.enqueue(line({ type: "trace", trace: await result.trace }));
      } finally {
        controller.close();
      }
    },
  });
}

/** Reads the NDJSON stream produced by `decisionStream`. */
export async function* readDecisionStream(body: ReadableStream<Uint8Array>): AsyncGenerator<DecisionStreamMessage> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const text = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (text) yield JSON.parse(text) as DecisionStreamMessage;
    }
    if (done) break;
  }
  if (buf.trim()) yield JSON.parse(buf) as DecisionStreamMessage;
}
