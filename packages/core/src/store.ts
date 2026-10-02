import type { Decision, DecisionLog, DecisionLogEntry, DecisionStore } from "./types";

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

/** Keeps entries in memory; handy for the debug panel and for tests. */
export class MemoryLog implements DecisionLog {
  readonly entries: DecisionLogEntry[] = [];
  async write(entry: DecisionLogEntry) {
    this.entries.push(entry);
  }
}
