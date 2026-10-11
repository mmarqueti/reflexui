import { useCallback, useEffect, useRef, useState } from "react";
import { readDecisionStream, type Decision } from "@reflexui-jev/core";

export interface UseAdaptiveSurfaceOptions {
  surfaceId: string;
  subjectId: string;
  /**
   * Your server endpoint. It receives `POST { surfaceId, subjectId }` and answers with the NDJSON
   * stream from core's `decisionStream(await decide(...))`: the immediate decision first, the fresh one later.
   */
  endpoint: string;
  /** Where feedback is posted. Defaults to `${endpoint}/feedback`. */
  feedbackEndpoint?: string;
  /** Apply a fresh decision in the same visit only if it arrives within this window. Default 300. */
  applyWithinMs?: number;
  /** Called when a fresh decision arrives too late to apply in this visit (the server cached it for the next one). */
  onDeferred?: (decision: Decision) => void;
  /** Set to false to skip fetching (e.g. while the subject is unknown). */
  enabled?: boolean;
  fetch?: typeof fetch;
}

export interface UseAdaptiveSurfaceResult {
  decision: Decision | undefined;
  /** loading: nothing yet · ready: immediate shown · updated: fresh applied · error: request failed */
  status: "loading" | "ready" | "updated" | "error";
  /** Fresh decision that arrived too late for this visit, if any. */
  deferred: Decision | undefined;
  error: string | undefined;
  /** Record "useful?" feedback for an item; feeds the next decision and replay labels. */
  feedback: (itemId: string, useful: boolean) => Promise<void>;
  /** Apply the deferred decision now (e.g. behind a "Refresh" button). */
  applyDeferred: () => void;
}

/**
 * Renders the immediate decision at once and swaps the adaptive zone only if
 * the fresh one lands inside the policy window. Headless: you render the cards.
 */
export function useAdaptiveSurface(options: UseAdaptiveSurfaceOptions): UseAdaptiveSurfaceResult {
  const { surfaceId, subjectId, endpoint, enabled = true } = options;
  const [decision, setDecision] = useState<Decision>();
  const [deferred, setDeferred] = useState<Decision>();
  const [status, setStatus] = useState<UseAdaptiveSurfaceResult["status"]>("loading");
  const [error, setError] = useState<string>();
  // Keep the latest options in a ref so the effect only re-runs when the subject changes.
  const opts = useRef(options);
  opts.current = options;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const started = Date.now();
    setDecision(undefined);
    setDeferred(undefined);
    setError(undefined);
    setStatus("loading");
    (async () => {
      try {
        const doFetch = opts.current.fetch ?? fetch;
        const res = await doFetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ surfaceId, subjectId }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`${endpoint} responded ${res.status}`);
        const windowMs = opts.current.applyWithinMs ?? 300;
        for await (const msg of readDecisionStream(res.body)) {
          if (controller.signal.aborted) return;
          if (msg.type === "immediate") {
            setDecision(msg.decision);
            setStatus("ready");
          } else if (Date.now() - started <= windowMs) {
            setDecision(msg.decision);
            setStatus("updated");
          } else {
            setDeferred(msg.decision);
            opts.current.onDeferred?.(msg.decision);
          }
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    })();
    return () => controller.abort();
  }, [surfaceId, subjectId, endpoint, enabled]);

  const feedback = useCallback(
    async (itemId: string, useful: boolean) => {
      const o = opts.current;
      await (o.fetch ?? fetch)(o.feedbackEndpoint ?? `${o.endpoint}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surfaceId: o.surfaceId, subjectId: o.subjectId, itemId, useful }),
      });
    },
    [],
  );

  const applyDeferred = useCallback(() => {
    setDeferred((d) => {
      if (d) {
        setDecision(d);
        setStatus("updated");
      }
      return undefined;
    });
  }, []);

  return { decision, status, deferred, error, feedback, applyDeferred };
}
