import type { Policy, Surface, SurfaceDefinition } from "./types";

/** Conservative defaults. Calibrate them with @reflexui-jev/replay. */
export const defaultPolicy: Policy = {
  minScore: 1.0,
  minConfidence: 0.6,
  alertThreshold: 0.75,
  adaptiveSlots: 6,
  suggestionSlots: 3,
  maxSwapsPerVisit: 2,
  hysteresis: 0.5,
  pinForMs: 24 * 60 * 60 * 1000,
  applyWithinMs: 300,
  timeoutMs: 1000,
  minRefreshMs: 10 * 60 * 1000,
};

export function defineSurface<Ctx>(definition: SurfaceDefinition<Ctx>): Surface<Ctx> {
  const ids = new Set<string>();
  for (const item of definition.items) {
    if (ids.has(item.id)) throw new Error(`Duplicate item id "${item.id}"`);
    ids.add(item.id);
  }
  return { ...definition, policy: { ...defaultPolicy, ...definition.policy } };
}
