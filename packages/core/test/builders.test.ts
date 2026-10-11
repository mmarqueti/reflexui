import { describe, expect, it } from "vitest";
import { MemoryLog, MemoryStore, buildReasons, choice, defineSurface, defaultPolicy, noul, score } from "../src/index";
import type { Decision, SignalFact } from "../src/types";

describe("question builders", () => {
  it("score() accepts 2 to 10 levels", () => {
    expect(score("p", ["a", "b"])).toEqual({ type: "score", prompt: "p", levels: ["a", "b"] });
    expect(() => score("p", ["a"])).toThrow(/2 to 10 levels, got 1/);
    expect(() => score("p", Array.from({ length: 11 }, (_, i) => String(i)))).toThrow(/got 11/);
    expect(score("p", Array.from({ length: 10 }, (_, i) => String(i))).levels).toHaveLength(10);
  });

  it("choice() accepts 2 to 255 options and keeps null as the catch-all", () => {
    expect(choice("p", { a: "A", other: null })).toEqual({ type: "choice", prompt: "p", options: { a: "A", other: null } });
    expect(() => choice("p", { a: "A" })).toThrow(/2 to 255 options, got 1/);
    const many = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`o${i}`, null]));
    expect(() => choice("p", many)).toThrow(/got 256/);
  });

  it("noul() wraps a yes/no prompt", () => {
    expect(noul("Is it?")).toEqual({ type: "noul", prompt: "Is it?" });
  });
});

describe("buildReasons", () => {
  const templates = [
    { when: "anomaly", text: "{area} is {ratio}x normal" },
    { when: "navigation", text: "You opened {area} {visits} times" },
  ];
  const facts: SignalFact[] = [
    { area: "billing", kind: "anomaly", values: { area: "Billing", ratio: 2.6 } },
    { area: "billing", kind: "navigation", values: { area: "Billing", visits: 11 } },
    { area: "usage", kind: "anomaly", values: { area: "Usage", ratio: 9 } },
    { area: "billing", kind: "conversation", values: { tickets: 3 } },
  ];

  it("fills templates from the facts of the item's area only", () => {
    expect(buildReasons("billing", templates, facts)).toEqual(["Billing is 2.6x normal", "You opened Billing 11 times"]);
  });

  it("skips facts without a template, and returns nothing without templates", () => {
    expect(buildReasons("billing", [templates[0]!], facts)).toEqual(["Billing is 2.6x normal"]);
    expect(buildReasons("billing", undefined, facts)).toEqual([]);
    expect(buildReasons("billing", [], facts)).toEqual([]);
  });

  it("keeps an unknown placeholder visible instead of printing undefined", () => {
    expect(buildReasons("x", [{ when: "anomaly", text: "{missing} here" }], [{ area: "x", kind: "anomaly", values: {} }])).toEqual(["{missing} here"]);
  });
});

describe("defineSurface", () => {
  const base = {
    id: "s", fixed: () => [], defaultOrder: () => [], signals: [],
    relevanceLevels: ["a", "b"], relevancePrompt: "{title}",
  };
  it("rejects duplicate item ids", () => {
    const item = { id: "a", kind: "card" as const, area: "x", title: "A" };
    expect(() => defineSurface({ ...base, items: [item, item] })).toThrow(/Duplicate item id "a"/);
  });

  it("merges policy overrides over the defaults", () => {
    const s = defineSurface({ ...base, items: [], policy: { adaptiveSlots: 4 } });
    expect(s.policy).toEqual({ ...defaultPolicy, adaptiveSlots: 4 });
    expect(defineSurface({ ...base, items: [] }).policy).toEqual(defaultPolicy);
  });
});

describe("stores", () => {
  const decision: Decision = { surfaceId: "s", subjectId: "u", fixed: [], adaptive: [], suggestions: [], source: "fresh", createdAt: 1 };
  it("MemoryStore returns what was set and undefined otherwise", async () => {
    const store = new MemoryStore();
    expect(await store.get("k")).toBeUndefined();
    await store.set("k", decision);
    expect(await store.get("k")).toBe(decision);
  });

  it("MemoryLog keeps entries in order", async () => {
    const log = new MemoryLog();
    await log.write({ decision, requests: {}, results: {}, shown: { applied: true, latencyMs: 1 } });
    await log.write({ decision, requests: {}, results: {}, shown: { applied: false, latencyMs: 900 } });
    expect(log.entries.map((e) => e.shown.applied)).toEqual([true, false]);
  });
});
