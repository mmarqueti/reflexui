/**
 * Core vocabulary of reflexui. Nothing in this file knows about any
 * business domain: restaurants, SaaS and e-commerce all plug in through these
 * types.
 */

// ---------------------------------------------------------------------------
// Questions and answers (the typed-judgment contract)
// ---------------------------------------------------------------------------

/** Ordered rubric. Each level must describe a situation, not an adjective. */
export interface ScoreQuestion {
  type: "score";
  prompt: string;
  levels: readonly string[]; // 2..10 levels
}

/** Pick one of the named options. `null` description = catch-all option. */
export interface ChoiceQuestion {
  type: "choice";
  prompt: string;
  options: Readonly<Record<string, string | null>>; // up to 255 options
}

/** Yes/no judgment returned as a probability in [0, 1]. */
export interface NoulQuestion {
  type: "noul";
  prompt: string;
}

export type Question = ScoreQuestion | ChoiceQuestion | NoulQuestion;

export interface ScoreAnswer {
  type: "score";
  /** Expected position on the rubric, 0 = first level. */
  score: number;
  confidence: number;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface NoulAnswer {
  type: "noul";
  probability: number;
}

export type Answer = ScoreAnswer | ChoiceAnswer | NoulAnswer;

// ---------------------------------------------------------------------------
// Decider (provider-agnostic model access)
// ---------------------------------------------------------------------------

export interface EvaluateRequest {
  /** Compact context. Keep it small: accuracy drops as unrelated content grows. */
  state: Record<string, unknown>;
  questions: Record<string, Question>;
  signal?: AbortSignal;
}

export interface EvaluateResult {
  answers: Record<string, Answer>;
  usage?: { inputTokens: number };
  latencyMs?: number;
  model?: string;
}

/** Anything that can answer typed questions: Jev via any gateway, an LLM, a mock. */
export interface Decider {
  readonly name: string;
  evaluate(request: EvaluateRequest): Promise<EvaluateResult>;
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/** Which model call a signal feeds. Each call only sees the signals it needs. */
export type CallName = "relevance" | "alerts";

export interface SignalSnapshot {
  /** Key used inside `state`, e.g. "metrics", "navigation", "chat". */
  key: string;
  /** Already summarized, model-ready value. No raw dumps. */
  value: unknown;
  /** Structured facts reused by reason templates, e.g. { area: "delivery", ratio: 2.3 }. */
  facts?: SignalFact[];
}

export interface SignalFact {
  area: string;
  kind: "anomaly" | "feedback" | "conversation" | "navigation" | (string & {});
  values: Record<string, string | number>;
}

export interface SignalProvider<Ctx> {
  id: string;
  feeds: readonly CallName[];
  /** Soft budget, enforced by the core before the call. */
  maxTokens?: number;
  collect(ctx: Ctx): Promise<SignalSnapshot>;
}

// ---------------------------------------------------------------------------
// Items (cards, alerts, suggestions)
// ---------------------------------------------------------------------------

export type ItemKind = "card" | "alert" | "suggestion";

/** Fixed sentence with {placeholders}, filled from signal facts. Never model-written. */
export interface ReasonTemplate {
  when: SignalFact["kind"];
  text: string;
}

interface BaseItem<Ctx> {
  id: string;
  kind: ItemKind;
  /** Grouping used for focus, tie-breaks and reasons, e.g. "delivery". */
  area: string;
  title: string;
  /** Deterministic rule. Ineligible items are never sent to the model. */
  eligible?: (ctx: Ctx) => boolean;
  reasons?: readonly ReasonTemplate[];
}

export interface CardItem<Ctx> extends BaseItem<Ctx> {
  kind: "card";
  /** Relevance prompt; defaults to the surface's generic one with {title}. */
  relevancePrompt?: string;
}

export interface SuggestionItem<Ctx> extends BaseItem<Ctx> {
  kind: "suggestion";
  relevancePrompt?: string;
}

export interface AlertItem<Ctx> extends BaseItem<Ctx> {
  kind: "alert";
  /** Noul prompt, e.g. "Do recent reviews point to late deliveries?" */
  question: string;
}

export type SurfaceItem<Ctx> = CardItem<Ctx> | SuggestionItem<Ctx> | AlertItem<Ctx>;

// ---------------------------------------------------------------------------
// Policy (the code stays in charge)
// ---------------------------------------------------------------------------

export interface Policy {
  /** Minimum rubric position for a card to enter the adaptive zone. */
  minScore: number;
  minConfidence: number;
  /** Minimum probability for an alert to show. At most one alert is shown. */
  alertThreshold: number;
  adaptiveSlots: number;
  suggestionSlots: number;
  /** Maximum position changes in the adaptive zone per visit. */
  maxSwapsPerVisit: number;
  /** Score gap needed for an item to displace another one. */
  hysteresis: number;
  /** How long a promoted item keeps its slot. */
  pinForMs: number;
  /** Apply a fresh decision in the same visit only if it arrives within this window. */
  applyWithinMs: number;
  timeoutMs: number;
  /** Minimum interval between fresh decisions for the same subject. */
  minRefreshMs: number;
}

// ---------------------------------------------------------------------------
// Surface definition
// ---------------------------------------------------------------------------

export interface SurfaceDefinition<Ctx> {
  id: string;
  /** Fixed zone (first scroll): picked by code, never by the model. */
  fixed: (ctx: Ctx) => readonly string[];
  /** Default adaptive order, used as fallback and as the replay baseline. */
  defaultOrder: (ctx: Ctx) => readonly string[];
  items: readonly SurfaceItem<Ctx>[];
  signals: readonly SignalProvider<Ctx>[];
  /** Shared relevance rubric for cards and suggestions. */
  relevanceLevels: readonly string[];
  /** Generic relevance prompt; "{title}" is replaced per item. */
  relevancePrompt: string;
  /** Optional focus question, used for tie-breaks and reasons. */
  focus?: { prompt: string; options: Readonly<Record<string, string | null>> };
  policy?: Partial<Policy>;
}

export interface Surface<Ctx> extends SurfaceDefinition<Ctx> {
  policy: Policy;
}

// ---------------------------------------------------------------------------
// Decisions, storage and logging
// ---------------------------------------------------------------------------

export interface PlacedItem {
  id: string;
  score?: number;
  confidence?: number;
  probability?: number;
  reasons: string[];
  pinnedUntil?: number;
}

export type DecisionSource = "fresh" | "cache" | "default";

export interface Decision {
  surfaceId: string;
  /** Who the surface adapts to: an account, a store, a user. */
  subjectId: string;
  fixed: string[];
  adaptive: PlacedItem[];
  alert?: PlacedItem;
  suggestions: PlacedItem[];
  focus?: string;
  source: DecisionSource;
  createdAt: number;
}

export interface DecisionStore {
  get(key: string): Promise<Decision | undefined>;
  set(key: string, decision: Decision): Promise<void>;
}

export interface DecisionLogEntry {
  decision: Decision;
  requests: Partial<Record<CallName, EvaluateRequest>>;
  results: Partial<Record<CallName, EvaluateResult>>;
  shown: { applied: boolean; latencyMs: number };
}

export interface DecisionLog {
  write(entry: DecisionLogEntry): Promise<void>;
}
