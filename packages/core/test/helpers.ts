import { defineSurface } from "../src/surface";
import type { Answer, EvaluateResult, Policy, SurfaceItem } from "../src/types";

export interface Ctx { premium: boolean }

export const items: SurfaceItem<Ctx>[] = [
  { id: "a", kind: "card", area: "x", title: "A" },
  { id: "b", kind: "card", area: "x", title: "B" },
  { id: "c", kind: "card", area: "y", title: "C" },
  { id: "d", kind: "card", area: "y", title: "D" },
  { id: "e", kind: "card", area: "z", title: "E" },
  { id: "f", kind: "card", area: "z", title: "F", eligible: (c) => c.premium },
  { id: "alert-x", kind: "alert", area: "x", title: "Alert X", question: "Is X broken?" },
  { id: "alert-y", kind: "alert", area: "y", title: "Alert Y", question: "Is Y broken?" },
  { id: "s1", kind: "suggestion", area: "x", title: "S1" },
  { id: "s2", kind: "suggestion", area: "y", title: "S2" },
  { id: "s3", kind: "suggestion", area: "z", title: "S3" },
];

export function makeSurface(policy: Partial<Policy> = {}) {
  return defineSurface<Ctx>({
    id: "test",
    fixed: () => [],
    defaultOrder: () => ["a", "b", "c", "d", "e", "f"],
    items,
    signals: [],
    relevanceLevels: ["none", "low", "mid", "high"],
    relevancePrompt: "How relevant is {title} ({area})?",
    focus: { prompt: "Which area?", options: { x: "X", y: "Y", z: null } },
    policy: { adaptiveSlots: 3, suggestionSlots: 2, ...policy },
  });
}

/** Relevance answers: id -> [score, confidence]. */
export function relevance(scores: Record<string, [number, number?]>, extra: Record<string, Answer> = {}): EvaluateResult {
  const answers: Record<string, Answer> = { ...extra };
  for (const [id, [score, confidence = 0.9]] of Object.entries(scores)) {
    answers[`rel:${id}`] = { type: "score", score, confidence };
  }
  return { answers };
}

export function alerts(probabilities: Record<string, number>): EvaluateResult {
  return {
    answers: Object.fromEntries(
      Object.entries(probabilities).map(([id, probability]) => [`alert:${id}`, { type: "noul", probability } as Answer]),
    ),
  };
}
