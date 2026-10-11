import { buildReasons } from "./reasons";
import type {
  Answer,
  Decision,
  EvaluateResult,
  PlacedItem,
  SignalFact,
  Surface,
  SurfaceItem,
} from "./types";

export interface ComposeInput<Ctx> {
  surface: Surface<Ctx>;
  ctx: Ctx;
  subjectId: string;
  relevance?: EvaluateResult;
  alerts?: EvaluateResult;
  facts: readonly SignalFact[];
  previous?: Decision;
  /** Items kept out of the adaptive zone and suggestions (recent "not useful" feedback). */
  demoted?: ReadonlySet<string>;
  now: number;
}

/** Question keys shared by `buildRequests` and `compose`. */
export const relevanceKey = (itemId: string) => `rel:${itemId}`;
export const alertKey = (itemId: string) => `alert:${itemId}`;
export const FOCUS_KEY = "focus";

/** Items the model may judge: not in the fixed zone and passing their deterministic rule. */
export function eligibleItems<Ctx>(surface: Surface<Ctx>, ctx: Ctx): SurfaceItem<Ctx>[] {
  const fixed = new Set(surface.fixed(ctx));
  return surface.items.filter((i) => !fixed.has(i.id) && (i.eligible?.(ctx) ?? true));
}

export interface ScoreboardRow {
  id: string;
  kind: "card" | "suggestion";
  area: string;
  score: number;
  confidence: number;
  /** promoted | default order | suggested | below threshold | held back */
  status: string;
}

export interface AlertRow {
  id: string;
  probability: number;
  shown: boolean;
}

export interface ComposeTrace {
  decision: Decision;
  scoreboard: ScoreboardRow[];
  alertRows: AlertRow[];
  /** Position changes applied relative to the previous decision. */
  swaps: number;
}

/**
 * Pure function: model answers + previous decision -> next decision.
 * Applies thresholds, hysteresis, max swaps per visit, pins and fallback.
 * Deterministic, so it is fully unit-testable and replayable.
 */
export function compose<Ctx>(input: ComposeInput<Ctx>): Decision {
  return composeWithTrace(input).decision;
}

/** Same as `compose`, plus the intermediate scoreboard for debug panels and replay. */
export function composeWithTrace<Ctx>(input: ComposeInput<Ctx>): ComposeTrace {
  const { surface, ctx, previous, now } = input;
  const p = surface.policy;
  const demoted = input.demoted ?? new Set<string>();
  const eligible = eligibleItems(surface, ctx).filter((i) => !demoted.has(i.id));
  const eligibleIds = new Set(eligible.map((i) => i.id));
  const order = surface.defaultOrder(ctx);
  const rank = (id: string) => {
    const n = order.indexOf(id);
    return n < 0 ? Number.MAX_SAFE_INTEGER : n;
  };
  const answers = input.relevance?.answers ?? {};
  const itemOf = new Map(surface.items.map((i) => [i.id, i]));

  const rows: ScoreboardRow[] = [];
  for (const item of eligible) {
    if (item.kind === "alert") continue;
    const a: Answer | undefined = answers[relevanceKey(item.id)];
    if (a?.type === "score") {
      rows.push({ id: item.id, kind: item.kind, area: item.area, score: a.score, confidence: a.confidence, status: "" });
    }
  }
  const qualifies = (r: ScoreboardRow) => r.score >= p.minScore && r.confidence >= p.minConfidence;
  const byScore = (a: ScoreboardRow, b: ScoreboardRow) => b.score - a.score || rank(a.id) - rank(b.id);
  const rowOf = new Map(rows.map((r) => [r.id, r]));

  // Adaptive zone: qualified cards by score, padded from the default order.
  const cards = rows.filter((r) => r.kind === "card").sort(byScore);
  const scoreOf = (id: string) => rowOf.get(id)?.score ?? 0;
  const target = cards.filter(qualifies).map((r) => r.id);
  for (const id of order) {
    if (eligibleIds.has(id) && itemOf.get(id)?.kind === "card" && !target.includes(id)) target.push(id);
  }
  const targetTop = target.slice(0, p.adaptiveSlots);

  // Alert: at most one, the most likely above the threshold.
  const alertRows: AlertRow[] = eligible
    .filter((i) => i.kind === "alert")
    .map((i) => {
      const a = input.alerts?.answers[alertKey(i.id)];
      return { id: i.id, probability: a?.type === "noul" ? a.probability : 0, shown: false };
    })
    .sort((a, b) => b.probability - a.probability);
  const top = alertRows[0];
  let alert: PlacedItem | undefined;
  if (top && top.probability >= p.alertThreshold) {
    top.shown = true;
    const item = itemOf.get(top.id);
    alert = {
      id: top.id,
      probability: top.probability,
      reasons: item ? buildReasons(item.area, item.reasons, input.facts) : [],
    };
  }

  // A shown alert lifts pin protection for items in its own area (a stronger signal wins).
  const strongAlertArea = alert ? itemOf.get(alert.id)?.area : undefined;

  let list: string[];
  let swaps = 0;
  if (!previous) {
    list = targetTop;
    swaps = targetTop.length;
  } else {
    const pins = new Map(previous.adaptive.map((x) => [x.id, x.pinnedUntil ?? 0]));
    list = previous.adaptive.map((x) => x.id).filter((id) => eligibleIds.has(id));
    const newcomers = targetTop
      .filter((id) => !list.includes(id))
      .sort((a, b) => scoreOf(b) - scoreOf(a) || rank(a) - rank(b)); // largest gaps first
    for (const id of newcomers) {
      if (swaps >= p.maxSwapsPerVisit) break;
      if (list.length < p.adaptiveSlots) {
        list.push(id);
        swaps++;
        continue;
      }
      const victim = list
        .filter((v) => !targetTop.includes(v) && ((pins.get(v) ?? 0) <= now || strongAlertArea === itemOf.get(id)?.area))
        .sort((a, b) => scoreOf(a) - scoreOf(b))[0];
      if (victim !== undefined && scoreOf(id) - scoreOf(victim) > p.hysteresis) {
        list[list.indexOf(victim)] = id;
        swaps++;
      }
    }
    list = stableSortByScore(list, scoreOf);
  }

  const place = (id: string): PlacedItem => {
    const item = itemOf.get(id);
    const row = rowOf.get(id);
    const promoted = row ? qualifies(row) : false;
    return {
      id,
      score: row?.score,
      confidence: row?.confidence,
      reasons: promoted && item ? buildReasons(item.area, item.reasons, input.facts) : [],
      pinnedUntil: promoted ? now + p.pinForMs : undefined,
    };
  };

  const suggestions = rows
    .filter((r) => r.kind === "suggestion" && qualifies(r))
    .sort(byScore)
    .slice(0, p.suggestionSlots)
    .map((r) => place(r.id));

  for (const r of rows) {
    r.status = list.includes(r.id)
      ? qualifies(r) ? "promoted" : "default order"
      : suggestions.some((s) => s.id === r.id) ? "suggested"
      : qualifies(r) ? "held back" : "below threshold";
  }

  const focus = answers[FOCUS_KEY];
  const base = defaultDecision(surface, ctx, input.subjectId, now);
  const decision: Decision = {
    ...base,
    adaptive: list.map(place),
    alert,
    suggestions,
    focus: focus?.type === "choice" ? focus.choice : undefined,
    more: eligible
      .filter((i) => i.kind === "card" && !list.includes(i.id))
      .sort((a, b) => scoreOf(b.id) - scoreOf(a.id) || rank(a.id) - rank(b.id))
      .map((i) => i.id),
    demoted: [...demoted],
    source: "fresh",
  };
  return { decision, scoreboard: rows.sort(byScore), alertRows, swaps };
}

function stableSortByScore(ids: string[], scoreOf: (id: string) => number): string[] {
  return ids
    .map((id, i) => ({ id, i }))
    .sort((a, b) => scoreOf(b.id) - scoreOf(a.id) || a.i - b.i)
    .map((x) => x.id);
}

/** Decision used when there is no cache and no model answer. */
export function defaultDecision<Ctx>(surface: Surface<Ctx>, ctx: Ctx, subjectId: string, now: number): Decision {
  const eligible = new Set(
    eligibleItems(surface, ctx).filter((i) => i.kind === "card").map((i) => i.id),
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
    more: [...eligible].filter((id) => !surface.defaultOrder(ctx).slice(0, surface.policy.adaptiveSlots).includes(id)),
    source: "default",
    createdAt: now,
  };
}
