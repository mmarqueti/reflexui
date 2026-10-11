import { describe, expect, it, vi } from "vitest";
import { buildRequests, decide } from "../src/decide";
import { MemoryFeedbackStore, MemoryLog, MemoryStore, demotedItems } from "../src/store";
import { decisionStream, readDecisionStream } from "../src/stream";
import type { Decider, EvaluateRequest, EvaluateResult } from "../src/types";
import { alerts, makeSurface, relevance } from "./helpers";

const ctx = { premium: true };
const surface = makeSurface({ minRefreshMs: 0 });

/** Decider that answers by inspecting which questions were asked. */
function scripted(rel: EvaluateResult, alr: EvaluateResult = { answers: {} }): Decider & { calls: EvaluateRequest[] } {
  const calls: EvaluateRequest[] = [];
  return {
    name: "scripted",
    calls,
    async evaluate(req) {
      calls.push(req);
      return Object.keys(req.questions).some((k) => k.startsWith("alert:")) ? alr : rel;
    },
  };
}

describe("buildRequests", () => {
  it("asks score for cards and suggestions, noul for alerts, and one focus question", async () => {
    const r = await buildRequests(surface, ctx);
    expect(Object.keys(r.relevance.questions)).toEqual(
      expect.arrayContaining(["rel:a", "rel:f", "rel:s1", "focus"]),
    );
    expect(r.relevance.questions["rel:a"]).toMatchObject({ type: "score" });
    expect(r.relevance.questions["focus"]).toMatchObject({ type: "choice" });
    expect(Object.keys(r.alerts.questions)).toEqual(["alert:alert-x", "alert:alert-y"]);
    expect(r.alerts.questions["alert:alert-x"]).toMatchObject({ type: "noul" });
  });

  it("fills {title} and {area} in the relevance prompt and omits ineligible items", async () => {
    const r = await buildRequests(surface, { premium: false });
    expect(r.relevance.questions["rel:a"]).toMatchObject({ prompt: "How relevant is A (x)?" });
    expect(r.relevance.questions["rel:f"]).toBeUndefined();
  });

  it("sends each call only the signals that feed it", async () => {
    const withSignals = makeSurface();
    const signals = [
      { id: "m", feeds: ["relevance", "alerts"] as const, collect: async () => ({ key: "m", value: 1 }) },
      { id: "n", feeds: ["relevance"] as const, collect: async () => ({ key: "n", value: 2 }) },
    ];
    const r = await buildRequests({ ...withSignals, signals }, ctx);
    expect(r.relevance.state).toEqual({ m: 1, n: 2 });
    expect(r.alerts.state).toEqual({ m: 1 });
  });

  it("survives a failing signal provider", async () => {
    const s = { ...makeSurface(), signals: [
      { id: "bad", feeds: ["relevance"] as const, collect: async () => { throw new Error("db down"); } },
      { id: "ok", feeds: ["relevance"] as const, collect: async () => ({ key: "ok", value: 1, facts: [{ area: "x", kind: "anomaly", values: {} }] }) },
    ] };
    const r = await buildRequests(s, ctx);
    expect(r.relevance.state).toEqual({ ok: 1 });
    expect(r.facts).toHaveLength(1);
  });
});

describe("decide", () => {
  it("returns the default decision at once on a first visit, then the composed one", async () => {
    const decider = scripted(relevance({ c: [2.5], d: [2.0], e: [1.8] }), alerts({ "alert-y": 0.9 }));
    const store = new MemoryStore();
    const log = new MemoryLog();
    const res = await decide({ surface, ctx, subjectId: "u1", decider, store, log });
    expect(res.immediate.source).toBe("default");
    const fresh = await res.fresh;
    expect(fresh.source).toBe("fresh");
    expect(fresh.adaptive.map((p) => p.id)).toEqual(["c", "d", "e"]);
    expect(fresh.alert?.id).toBe("alert-y");
    expect(decider.calls).toHaveLength(2); // relevance + alerts, in parallel
    expect(await store.get("test:u1")).toEqual(fresh);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.results.relevance).toBeDefined();
  });

  it("serves the cached decision as immediate on the next visit", async () => {
    const decider = scripted(relevance({ c: [2.5] }));
    const store = new MemoryStore();
    const first = await (await decide({ surface, ctx, subjectId: "u1", decider, store })).fresh;
    const second = await decide({ surface, ctx, subjectId: "u1", decider, store });
    expect(second.immediate.source).toBe("cache");
    expect(second.immediate.adaptive).toEqual(first.adaptive);
  });

  it("does not call the model again before minRefreshMs", async () => {
    const throttled = makeSurface({ minRefreshMs: 60_000 });
    const decider = scripted(relevance({ c: [2.5] }));
    const store = new MemoryStore();
    await (await decide({ surface: throttled, ctx, subjectId: "u1", decider, store })).fresh;
    const calls = decider.calls.length;
    const again = await decide({ surface: throttled, ctx, subjectId: "u1", decider, store });
    const t = await again.trace;
    expect(decider.calls).toHaveLength(calls);
    expect(t.error).toMatch(/minRefreshMs/);
    expect(t.decision.source).toBe("cache");
  });

  it("falls back to the default order when the decider throws", async () => {
    const decider: Decider = { name: "boom", evaluate: async () => { throw new Error("401 nope"); } };
    const res = await decide({ surface, ctx, subjectId: "u1", decider, store: new MemoryStore() });
    const t = await res.trace;
    expect(t.decision.source).toBe("default");
    expect(t.decision.adaptive.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(t.error).toContain("401 nope");
    expect(await res.fresh).toBe(t.decision);
  });

  it("aborts at policy.timeoutMs and falls back", async () => {
    const slow: Decider = {
      name: "slow",
      evaluate: ({ signal }) =>
        new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    };
    const quick = makeSurface({ timeoutMs: 20, minRefreshMs: 0 });
    const res = await decide({ surface: quick, ctx, subjectId: "u1", decider: slow, store: new MemoryStore() });
    const t = await res.trace;
    expect(t.error).toContain("timeout");
    expect(t.decision.source).toBe("default");
  });

  it("keeps working when only one of the two calls fails", async () => {
    const decider: Decider = {
      name: "half",
      async evaluate(req) {
        if (Object.keys(req.questions).some((k) => k.startsWith("alert:"))) throw new Error("alerts down");
        return relevance({ c: [2.5] });
      },
    };
    const t = await (await decide({ surface, ctx, subjectId: "u1", decider, store: new MemoryStore() })).trace;
    expect(t.decision.source).toBe("fresh");
    expect(t.decision.adaptive[0]!.id).toBe("c");
    expect(t.decision.alert).toBeUndefined();
    expect(t.error).toContain("alerts");
  });

  it("never rejects when the store fails", async () => {
    const store = { get: vi.fn().mockRejectedValue(new Error("redis")), set: vi.fn().mockRejectedValue(new Error("redis")) };
    const res = await decide({ surface, ctx, subjectId: "u1", decider: scripted(relevance({ c: [2.5] })), store });
    expect(res.immediate.source).toBe("default");
    expect((await res.fresh).source).toBe("fresh");
  });

  it("demotes items after 'not useful' feedback until demoteForMs passes", async () => {
    const decider = scripted(relevance({ c: [2.9], d: [2.0], e: [1.8], a: [1.2] }));
    const feedback = new MemoryFeedbackStore();
    let t = 1_000;
    await feedback.record({ surfaceId: "test", subjectId: "u1", itemId: "c", useful: false, at: t });
    const run = async (now: number) =>
      (await (await decide({ surface, ctx, subjectId: "u1", decider, store: new MemoryStore(), feedback, now: () => now })).fresh);
    const during = await run(t + 1000);
    expect(during.adaptive.map((p) => p.id)).not.toContain("c");
    expect(during.demoted).toEqual(["c"]);
    const after = await run(t + surface.policy.demoteForMs + 1);
    expect(after.adaptive.map((p) => p.id)).toContain("c");
  });
});

describe("demotedItems", () => {
  it("lets the latest feedback win", () => {
    const e = (itemId: string, useful: boolean, at: number) => ({ surfaceId: "s", subjectId: "u", itemId, useful, at });
    expect([...demotedItems([e("a", false, 1), e("a", true, 2), e("b", false, 3)], 10, 100)]).toEqual(["b"]);
  });
});

describe("decision stream", () => {
  it("sends immediate first and fresh later, and reads back", async () => {
    const res = await decide({ surface, ctx, subjectId: "u1", decider: scripted(relevance({ c: [2.5] })), store: new MemoryStore() });
    const messages = [];
    for await (const m of readDecisionStream(decisionStream(res))) messages.push(m);
    expect(messages.map((m) => m.type)).toEqual(["immediate", "fresh"]);
    expect(messages[1]!.type === "fresh" && messages[1]!.decision.source).toBe("fresh");
  });

  it("sends the trace only when asked", async () => {
    const run = async (trace: boolean) => {
      const res = await decide({ surface, ctx, subjectId: "u1", decider: scripted(relevance({ c: [2.5] })), store: new MemoryStore() });
      const types = [];
      for await (const m of readDecisionStream(decisionStream(res, { trace }))) types.push(m.type);
      return types;
    };
    expect(await run(false)).toEqual(["immediate", "fresh"]);
    expect(await run(true)).toEqual(["immediate", "fresh", "trace"]);
  });
});
