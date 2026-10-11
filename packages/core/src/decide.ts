import { alertKey, composeWithTrace, defaultDecision, eligibleItems, FOCUS_KEY, relevanceKey } from "./compose";
import type { ComposeTrace } from "./compose";
import { demotedItems } from "./store";
import { choice, noul, score } from "./questions";
import type {
  CallName,
  Decider,
  Decision,
  DecisionLog,
  DecisionStore,
  EvaluateRequest,
  FeedbackStore,
  EvaluateResult,
  SignalFact,
  Surface,
} from "./types";

export interface DecideOptions<Ctx> {
  surface: Surface<Ctx>;
  ctx: Ctx;
  subjectId: string;
  decider: Decider;
  store: DecisionStore;
  log?: DecisionLog;
  /** When set, "not useful" feedback keeps items out of the adaptive zone for `policy.demoteForMs`. */
  feedback?: FeedbackStore;
  now?: () => number;
}

export interface DecideResult {
  /** What to render right now: cached or default, never blocked on the model. */
  immediate: Decision;
  /** Resolves with the fresh decision (or the immediate one on error/timeout). */
  fresh: Promise<Decision>;
  /** Resolves with the decision plus scoreboard and raw model I/O, for debug panels. */
  trace: Promise<DecideTrace>;
}

export interface DecideTrace extends Partial<ComposeTrace> {
  decision: Decision;
  requests: Partial<Record<CallName, EvaluateRequest>>;
  results: Partial<Record<CallName, EvaluateResult>>;
  facts: SignalFact[];
  latencyMs: number;
  /** Set when the model call failed or timed out; the decision is then the fallback. */
  error?: string;
}

export interface BuiltRequests {
  relevance: EvaluateRequest;
  alerts: EvaluateRequest;
  facts: SignalFact[];
}

const cacheKey = (surfaceId: string, subjectId: string) => `${surfaceId}:${subjectId}`;

/**
 * Builds the two model requests from eligible items and collected signals.
 * Each request only receives the signals that feed it.
 */
export async function buildRequests<Ctx>(surface: Surface<Ctx>, ctx: Ctx): Promise<BuiltRequests> {
  const settled = await Promise.allSettled(surface.signals.map((s) => s.collect(ctx)));
  const collected = settled.flatMap((r, i) =>
    r.status === "fulfilled" ? [{ signal: surface.signals[i]!, snapshot: r.value }] : [],
  );
  const facts = collected.flatMap((c) => c.snapshot.facts ?? []);
  const stateFor = (call: CallName) =>
    Object.fromEntries(
      collected.filter((c) => c.signal.feeds.includes(call)).map((c) => [c.snapshot.key, c.snapshot.value]),
    );

  const relevanceQuestions: EvaluateRequest["questions"] = {};
  const alertQuestions: EvaluateRequest["questions"] = {};
  for (const item of eligibleItems(surface, ctx)) {
    if (item.kind === "alert") {
      alertQuestions[alertKey(item.id)] = noul(item.question);
    } else {
      const prompt = (item.relevancePrompt ?? surface.relevancePrompt)
        .replaceAll("{title}", item.title)
        .replaceAll("{area}", item.area);
      relevanceQuestions[relevanceKey(item.id)] = score(prompt, surface.relevanceLevels);
    }
  }
  if (surface.focus && Object.keys(relevanceQuestions).length > 0) {
    relevanceQuestions[FOCUS_KEY] = choice(surface.focus.prompt, surface.focus.options);
  }
  return {
    relevance: { state: stateFor("relevance"), questions: relevanceQuestions },
    alerts: { state: stateFor("alerts"), questions: alertQuestions },
    facts,
  };
}

/**
 * Orchestrates one visit:
 * 1. returns the cached (or default) decision immediately;
 * 2. collects signals and builds the "relevance" and "alerts" requests;
 * 3. calls the decider for both in parallel, with timeout;
 * 4. composes the result under the surface policy and stores/logs it.
 *
 * The model never blocks `immediate`. Errors and timeouts resolve `fresh` with
 * the immediate decision instead of rejecting.
 */
export async function decide<Ctx>(options: DecideOptions<Ctx>): Promise<DecideResult> {
  const { surface, ctx, subjectId, decider, store, log, feedback } = options;
  const clock = options.now ?? Date.now;
  const key = cacheKey(surface.id, subjectId);
  const startedAt = clock();

  const cached = await store.get(key).catch(() => undefined);
  const immediate: Decision = cached
    ? { ...cached, source: "cache" }
    : defaultDecision(surface, ctx, subjectId, startedAt);

  const trace = (async (): Promise<DecideTrace> => {
    const fallback = (error: string, partial: Partial<DecideTrace> = {}): DecideTrace => ({
      decision: immediate, requests: {}, results: {}, facts: [], latencyMs: clock() - startedAt, error, ...partial,
    });

    // Too soon since the last fresh decision for this subject: reuse it.
    if (cached && startedAt - cached.createdAt < surface.policy.minRefreshMs) {
      return fallback("skipped: minRefreshMs not elapsed");
    }

    let built: BuiltRequests;
    try {
      built = await buildRequests(surface, ctx);
    } catch (e) {
      return fallback(`signals failed: ${errorMessage(e)}`);
    }
    const requests: DecideTrace["requests"] = {};
    if (Object.keys(built.relevance.questions).length > 0) requests.relevance = built.relevance;
    if (Object.keys(built.alerts.questions).length > 0) requests.alerts = built.alerts;

    const errors: string[] = [];
    const call = async (name: CallName): Promise<EvaluateResult | undefined> => {
      const request = requests[name];
      if (!request) return undefined;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), surface.policy.timeoutMs);
      try {
        return await decider.evaluate({ ...request, signal: controller.signal });
      } catch (e) {
        errors.push(`${name}: ${controller.signal.aborted ? "timeout" : errorMessage(e)}`);
        return undefined;
      } finally {
        clearTimeout(timer);
      }
    };
    const [relevance, alerts] = await Promise.all([call("relevance"), call("alerts")]);
    const results: DecideTrace["results"] = {};
    if (relevance) results.relevance = relevance;
    if (alerts) results.alerts = alerts;

    if (!relevance && !alerts) {
      return fallback(errors.join("; ") || "no model answers", { requests, facts: built.facts });
    }

    const now = clock();
    const entries = (await feedback?.list(surface.id, subjectId).catch(() => [])) ?? [];
    const composed = composeWithTrace({
      surface, ctx, subjectId, relevance, alerts, facts: built.facts, previous: cached, now,
      demoted: demotedItems(entries, now, surface.policy.demoteForMs),
    });
    await store.set(key, composed.decision).catch(() => undefined);
    const latencyMs = now - startedAt;
    await log
      ?.write({
        decision: composed.decision,
        requests,
        results,
        shown: { applied: latencyMs <= surface.policy.applyWithinMs, latencyMs },
      })
      .catch(() => undefined);
    return {
      ...composed, requests, results, facts: built.facts, latencyMs,
      ...(errors.length ? { error: errors.join("; ") } : {}),
    };
  })();

  return { immediate, fresh: trace.then((t) => t.decision), trace };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
