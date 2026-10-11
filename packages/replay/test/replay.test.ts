import { describe, expect, it, vi } from "vitest";
import { defineSurface, type Answer, type Decider } from "@reflexui-jev/core";
import { cachingDecider, formatReport, parseReplayCases, runReplay } from "../src/index";

interface Ctx { hot: string }

const surface = defineSurface<Ctx>({
  id: "r",
  fixed: () => [],
  defaultOrder: () => ["a", "b", "c", "d", "e"],
  items: [
    { id: "a", kind: "card", area: "x", title: "A" },
    { id: "b", kind: "card", area: "x", title: "B" },
    { id: "c", kind: "card", area: "y", title: "C" },
    { id: "d", kind: "card", area: "y", title: "D" },
    { id: "e", kind: "card", area: "z", title: "E" },
    { id: "alert-z", kind: "alert", area: "z", title: "Z alert", question: "Is Z broken?" },
  ],
  signals: [{ id: "s", feeds: ["relevance", "alerts"], collect: async (ctx) => ({ key: "hot_area", value: ctx.hot }) }],
  relevanceLevels: ["none", "low", "mid", "high"],
  relevancePrompt: "Relevance of {title} ({area})?",
  policy: { adaptiveSlots: 3 },
});

/** Decider that boosts every item whose area equals state.hot_area. */
const decider: Decider = {
  name: "area-boost",
  async evaluate({ state, questions }) {
    const answers: Record<string, Answer> = {};
    for (const [key, q] of Object.entries(questions)) {
      const id = key.split(":")[1]!;
      const area = surface.items.find((i) => i.id === id)?.area;
      if (q.type === "score") answers[key] = { type: "score", score: area === state.hot_area ? 2.8 : 0.2, confidence: 0.9 };
      if (q.type === "noul") answers[key] = { type: "noul", probability: area === state.hot_area ? 0.9 : 0.1 };
    }
    return { answers, usage: { inputTokens: 10 } };
  },
};

const cases = [
  { id: "y-hot", subjectId: "1", ctx: { hot: "y" }, expectedTop: ["c", "d"] },
  { id: "z-hot", subjectId: "2", ctx: { hot: "z" }, expectedTop: ["alert-z", "e"] },
  { id: "x-hot", subjectId: "3", ctx: { hot: "x" }, expectedTop: ["a", "b"] }, // default order already right
];

describe("runReplay", () => {
  it("beats the default order when the model reads the signals", async () => {
    const r = await runReplay({ surface, decider, cases });
    expect(r.cases).toBe(3);
    expect(r.hitRate).toBe(1);
    expect(r.baselineHitRate).toBeCloseTo(1 / 3);
    expect(r.perCase.find((c) => c.id === "z-hot")?.top[0]).toBe("alert-z"); // alert counts first
    expect(r.inputTokens).toBe(60); // 2 calls x 10 tokens x 3 cases (the x case has an alert call too)
    expect(r.failures).toBe(0);
    expect(r.latencyP95Ms).toBeGreaterThanOrEqual(r.latencyP50Ms);
  });

  it("scores a model that returns nothing useful no better than the default order", async () => {
    const blind: Decider = { name: "blind", evaluate: async () => ({ answers: {} }) };
    const r = await runReplay({ surface, decider: blind, cases });
    expect(r.hitRate).toBe(r.baselineHitRate);
  });

  it("falls back to the default order and counts failures when the decider throws", async () => {
    const boom: Decider = { name: "boom", evaluate: async () => { throw new Error("401"); } };
    const r = await runReplay({ surface, decider: boom, cases });
    expect(r.failures).toBe(3);
    expect(r.hitRate).toBe(r.baselineHitRate);
    expect(r.perCase[0]!.error).toBe("401");
  });

  it("lets a policy override change the outcome (threshold sweep)", async () => {
    const strict = await runReplay({ surface, decider, cases, policy: { minConfidence: 0.95 } });
    expect(strict.hitRate).toBeLessThan(1); // every answer has confidence 0.9, nothing qualifies
  });

  it("honors topSlots and minHits", async () => {
    const r = await runReplay({ surface, decider, cases, topSlots: 1, minHits: 1 });
    expect(r.perCase.every((c) => c.top.length === 1)).toBe(true);
  });

  it("handles an empty case list", async () => {
    const r = await runReplay({ surface, decider, cases: [] });
    expect(r).toMatchObject({ cases: 0, hitRate: 0, baselineHitRate: 0, latencyP50Ms: 0 });
  });
});

describe("cachingDecider", () => {
  it("calls the model once per distinct request across runs", async () => {
    const inner = { name: "i", evaluate: vi.fn(decider.evaluate) } as Decider & { evaluate: ReturnType<typeof vi.fn> };
    const cached = cachingDecider(inner);
    await runReplay({ surface, decider: cached, cases, policy: { minConfidence: 0.5 } });
    const calls = inner.evaluate.mock.calls.length;
    await runReplay({ surface, decider: cached, cases, policy: { minConfidence: 0.8 } });
    expect(inner.evaluate.mock.calls.length).toBe(calls);
    expect(cached.size).toBe(calls);
  });
});

describe("parseReplayCases / formatReport", () => {
  it("parses JSON Lines and reports the line of a bad record", () => {
    const text = cases.map((c) => JSON.stringify(c)).join("\n") + "\n\n";
    expect(parseReplayCases<Ctx>(text)).toHaveLength(3);
    expect(() => parseReplayCases('{"id":"x"}')).toThrow(/line 1 needs/);
    expect(() => parseReplayCases("nope")).toThrow(/line 1 is not valid JSON/);
  });

  it("formats a readable summary", async () => {
    const out = formatReport(await runReplay({ surface, decider, cases }));
    expect(out).toContain("hit rate: 100%");
    expect(out).toContain("vs default order: 33%");
    expect(out).toContain("+ y-hot");
  });
});
