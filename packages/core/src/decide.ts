import type {
  Decider,
  Decision,
  DecisionLog,
  DecisionStore,
  EvaluateRequest,
  Surface,
} from "./types";

export interface DecideOptions<Ctx> {
  surface: Surface<Ctx>;
  ctx: Ctx;
  subjectId: string;
  decider: Decider;
  store: DecisionStore;
  log?: DecisionLog;
  now?: () => number;
}

export interface DecideResult {
  /** What to render right now: cached or default, never blocked on the model. */
  immediate: Decision;
  /** Resolves with the fresh decision (or the immediate one on error/timeout). */
  fresh: Promise<Decision>;
}

/**
 * Orchestrates one visit:
 * 1. returns the cached (or default) decision immediately;
 * 2. collects signals and builds the "relevance" and "alerts" requests;
 * 3. calls the decider for both in parallel, with timeout;
 * 4. composes the result under the surface policy and stores/logs it.
 *
 * Status: planned for milestone M1. See ROADMAP in the README.
 */
export function decide<Ctx>(_options: DecideOptions<Ctx>): DecideResult {
  throw new Error("decide(): not implemented yet (milestone M1)");
}

/** Builds the two model requests from eligible items and collected signals. */
export async function buildRequests<Ctx>(
  _surface: Surface<Ctx>,
  _ctx: Ctx,
): Promise<{ relevance: EvaluateRequest; alerts: EvaluateRequest }> {
  throw new Error("buildRequests(): not implemented yet (milestone M1)");
}
