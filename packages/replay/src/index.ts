import {
  buildRequests,
  composeWithTrace,
  defaultDecision,
  type Decider,
  type EvaluateRequest,
  type EvaluateResult,
  type Policy,
  type Surface,
} from "@reflexui-jev/core";

/** One labeled moment: the context at that time + what a human wanted on top. */
export interface ReplayCase<Ctx> {
  id: string; // e.g. "store-12/2026-W31"
  subjectId: string;
  ctx: Ctx;
  /** Item ids a human says should be in the top slots. */
  expectedTop: string[];
}

export interface ReplayCaseResult {
  id: string;
  /** What the surface put on top (alert first when one is shown, then the adaptive zone). */
  top: string[];
  hits: number;
  /** Hits of the surface's default order for the same case. */
  baselineHits: number;
  latencyMs: number;
  /** Set when the model call failed; the case then falls back to the default order. */
  error?: string;
}

export interface ReplayReport {
  cases: number;
  /** Share of cases where >= `minHits` expected items land in the top slots. */
  hitRate: number;
  /** Same metric for the surface's default order: the baseline to beat. */
  baselineHitRate: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  inputTokens: number;
  /** Cases where the model call failed (counted with the default order's result). */
  failures: number;
  perCase: ReplayCaseResult[];
}

export interface ReplayOptions<Ctx> {
  surface: Surface<Ctx>;
  decider: Decider;
  cases: ReplayCase<Ctx>[];
  topSlots?: number; // default 3
  minHits?: number; // default 2
  /** Override policy values for this run, to calibrate thresholds without redefining the surface. */
  policy?: Partial<Policy>;
  /** Cases evaluated at the same time. Default 4. */
  concurrency?: number;
}

const percentile = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]! : 0;

/**
 * Runs the surface over historical, labeled cases and compares it with the
 * default order. This is the go/no-go gate before showing anything to users.
 *
 * Each case is a first visit (no cache, no previous decision), so stability rules
 * do not apply: replay measures the quality of the ranking, not its smoothness.
 */
export async function runReplay<Ctx>(options: ReplayOptions<Ctx>): Promise<ReplayReport> {
  const topSlots = options.topSlots ?? 3;
  const minHits = options.minHits ?? 2;
  const surface: Surface<Ctx> = { ...options.surface, policy: { ...options.surface.policy, ...options.policy } };
  const now = 0; // fixed clock: replay is deterministic given the answers

  const perCase: ReplayCaseResult[] = new Array(options.cases.length);
  let inputTokens = 0;
  let next = 0;

  const worker = async () => {
    for (;;) {
      const index = next++;
      const c = options.cases[index];
      if (!c) return;
      const baselineIds = defaultDecision(surface, c.ctx, c.subjectId, now).adaptive.map((p) => p.id).slice(0, topSlots);
      let top = baselineIds;
      let error: string | undefined;
      const started = performance.now();
      try {
        const built = await buildRequests(surface, c.ctx);
        const call = async (request: EvaluateRequest): Promise<EvaluateResult | undefined> => {
          if (Object.keys(request.questions).length === 0) return undefined;
          const result = await options.decider.evaluate(request);
          inputTokens += result.usage?.inputTokens ?? 0;
          return result;
        };
        const [relevance, alerts] = await Promise.all([call(built.relevance), call(built.alerts)]);
        const { decision } = composeWithTrace({
          surface, ctx: c.ctx, subjectId: c.subjectId, relevance, alerts, facts: built.facts, now,
        });
        top = [...(decision.alert ? [decision.alert.id] : []), ...decision.adaptive.map((p) => p.id)].slice(0, topSlots);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      const latencyMs = Math.round(performance.now() - started);
      const count = (ids: string[]) => c.expectedTop.filter((id) => ids.includes(id)).length;
      perCase[index] = {
        id: c.id, top, hits: count(top), baselineHits: count(baselineIds), latencyMs, ...(error ? { error } : {}),
      };
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));

  const need = (c: ReplayCase<Ctx>) => Math.min(minHits, c.expectedTop.length);
  const rate = (hits: (r: ReplayCaseResult) => number) =>
    options.cases.length
      ? options.cases.filter((c, i) => hits(perCase[i]!) >= need(c)).length / options.cases.length
      : 0;
  const latencies = perCase.map((r) => r.latencyMs).sort((a, b) => a - b);
  return {
    cases: options.cases.length,
    hitRate: rate((r) => r.hits),
    baselineHitRate: rate((r) => r.baselineHits),
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
    inputTokens,
    failures: perCase.filter((r) => r.error).length,
    perCase,
  };
}

/**
 * Wraps a decider and remembers answers by request. Replaying the same cases with different
 * policy values (a threshold sweep) then calls the model once per case, not once per run.
 */
export function cachingDecider(inner: Decider): Decider & { readonly size: number } {
  const cache = new Map<string, EvaluateResult>();
  return {
    name: `cached(${inner.name})`,
    get size() {
      return cache.size;
    },
    async evaluate(request) {
      const key = JSON.stringify([request.state, request.questions]);
      const hit = cache.get(key);
      if (hit) return hit;
      const result = await inner.evaluate(request);
      cache.set(key, result);
      return result;
    },
  };
}

/** Parses cases stored as JSON Lines: one `ReplayCase` per line. Blank lines are skipped. */
export function parseReplayCases<Ctx = unknown>(jsonl: string): ReplayCase<Ctx>[] {
  return jsonl
    .split("\n")
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => line)
    .map(({ line, n }) => {
      let c: ReplayCase<Ctx>;
      try {
        c = JSON.parse(line) as ReplayCase<Ctx>;
      } catch {
        throw new Error(`replay case on line ${n} is not valid JSON`);
      }
      if (!c.id || !c.subjectId || !Array.isArray(c.expectedTop) || c.ctx === undefined) {
        throw new Error(`replay case on line ${n} needs id, subjectId, ctx and expectedTop[]`);
      }
      return c;
    });
}

/** Human-readable summary, e.g. for the terminal or a CI log. */
export function formatReport(report: ReplayReport): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const lines = [
    `cases: ${report.cases}${report.failures ? ` (${report.failures} fell back to the default order after a model error)` : ""}`,
    `hit rate: ${pct(report.hitRate)}  vs default order: ${pct(report.baselineHitRate)}  (${report.hitRate >= report.baselineHitRate ? "+" : ""}${Math.round((report.hitRate - report.baselineHitRate) * 100)} pts)`,
    `latency p50 ${report.latencyP50Ms} ms · p95 ${report.latencyP95Ms} ms · input tokens ${report.inputTokens}`,
    "",
    ...report.perCase.map(
      (r) => `${r.hits > r.baselineHits ? "+" : r.hits < r.baselineHits ? "-" : "="} ${r.id}: ${r.hits} hit(s) vs ${r.baselineHits} · top: ${r.top.join(", ")}${r.error ? ` · ERROR ${r.error}` : ""}`,
    ),
  ];
  return lines.join("\n");
}
