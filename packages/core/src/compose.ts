import type { Decision, EvaluateResult, SignalFact, Surface } from "./types";

export interface ComposeInput<Ctx> {
  surface: Surface<Ctx>;
  ctx: Ctx;
  subjectId: string;
  relevance?: EvaluateResult;
  alerts?: EvaluateResult;
  facts: readonly SignalFact[];
  previous?: Decision;
  now: number;
}

/**
 * Pure function: model answers + previous decision -> next decision.
 * Applies thresholds, hysteresis, max swaps per visit, pins and fallback.
 * Deterministic, so it is fully unit-testable and replayable.
 *
 * Status: planned for milestone M1.
 */
export function compose<Ctx>(_input: ComposeInput<Ctx>): Decision {
  throw new Error("compose(): not implemented yet (milestone M1)");
}

/** Decision used when there is no cache and no model answer. */
export function defaultDecision<Ctx>(surface: Surface<Ctx>, ctx: Ctx, subjectId: string, now: number): Decision {
  const eligible = new Set(
    surface.items.filter((i) => i.kind === "card" && (i.eligible?.(ctx) ?? true)).map((i) => i.id),
  );
  return {
    surfaceId: surface.id,
    subjectId,
    fixed: [...surface.fixed(ctx)],
    adaptive: surface
      .defaultOrder(ctx)
      .filter((id) => eligible.has(id))
      .slice(0, surface.policy.adaptiveSlots)
      .map((id) => ({ id, reasons: [] })),
    suggestions: [],
    source: "default",
    createdAt: now,
  };
}
