import type { Decider, Surface } from "@reflexui-jev/core";

/** One labeled moment: the context at that time + what a human wanted on top. */
export interface ReplayCase<Ctx> {
  id: string; // e.g. "store-12/2026-W31"
  subjectId: string;
  ctx: Ctx;
  /** Item ids a human says should be in the top slots. */
  expectedTop: string[];
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
  perCase: Array<{ id: string; top: string[]; hits: number; baselineHits: number }>;
}

export interface ReplayOptions<Ctx> {
  surface: Surface<Ctx>;
  decider: Decider;
  cases: ReplayCase<Ctx>[];
  topSlots?: number; // default 3
  minHits?: number; // default 2
}

/**
 * Runs the surface over historical, labeled cases and compares it with the
 * default order. This is the go/no-go gate before showing anything to users.
 *
 * Status: planned for milestone M2.
 */
export async function runReplay<Ctx>(_options: ReplayOptions<Ctx>): Promise<ReplayReport> {
  throw new Error("runReplay(): not implemented yet (milestone M2)");
}
