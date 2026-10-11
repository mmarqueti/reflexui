import type { Decision, DecisionLog, DecisionLogEntry, DecisionStore, FeedbackEntry, FeedbackStore } from "./types";

/** In-process store for demos and tests. Use a Redis/Postgres adapter in production. */
export class MemoryStore implements DecisionStore {
  private readonly map = new Map<string, Decision>();
  async get(key: string) {
    return this.map.get(key);
  }
  async set(key: string, decision: Decision) {
    this.map.set(key, decision);
  }
}

/** In-process feedback store for demos and tests. */
export class MemoryFeedbackStore implements FeedbackStore {
  private readonly entries: FeedbackEntry[] = [];
  async record(entry: FeedbackEntry) {
    this.entries.push(entry);
  }
  async list(surfaceId: string, subjectId: string) {
    return this.entries.filter((e) => e.surfaceId === surfaceId && e.subjectId === subjectId);
  }
}

/** Item ids currently demoted: the latest feedback per item is "not useful" and still inside `demoteForMs`. */
export function demotedItems(entries: readonly FeedbackEntry[], now: number, demoteForMs: number): Set<string> {
  const latest = new Map<string, FeedbackEntry>();
  for (const e of [...entries].sort((a, b) => a.at - b.at)) latest.set(e.itemId, e);
  return new Set([...latest.values()].filter((e) => !e.useful && now - e.at < demoteForMs).map((e) => e.itemId));
}

/** Keeps entries in memory; handy for the debug panel and for tests. */
export class MemoryLog implements DecisionLog {
  readonly entries: DecisionLogEntry[] = [];
  async write(entry: DecisionLogEntry) {
    this.entries.push(entry);
  }
}
