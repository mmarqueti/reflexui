import { describe, expect, it } from "vitest";
import { compose, composeWithTrace, defaultDecision } from "../src/compose";
import type { Decision } from "../src/types";
import { alerts, makeSurface, relevance } from "./helpers";

const ctx = { premium: true };
const NOW = 1_000_000;
const base = { ctx, subjectId: "u1", facts: [], now: NOW };
const ids = (d: Decision) => d.adaptive.map((p) => p.id);

describe("compose: ranking", () => {
  const surface = makeSurface();

  it("orders qualified cards by score and never exceeds the slots", () => {
    const d = compose({ ...base, surface, relevance: relevance({ a: [1.2], b: [2.8], c: [2.0], d: [1.5], e: [0.2] }) });
    expect(ids(d)).toEqual(["b", "c", "d"]);
    expect(d.source).toBe("fresh");
  });

  it("pads from the default order when too few cards qualify", () => {
    const d = compose({ ...base, surface, relevance: relevance({ c: [2.5], a: [0.1], b: [0.1] }) });
    expect(ids(d)).toEqual(["c", "a", "b"]);
    expect(d.adaptive.find((p) => p.id === "a")?.reasons).toEqual([]);
  });

  it("ignores cards below minConfidence even with a high score", () => {
    const d = compose({ ...base, surface, relevance: relevance({ c: [3, 0.3], e: [2, 0.9] }) });
    expect(ids(d)[0]).toBe("e");
    const t = composeWithTrace({ ...base, surface, relevance: relevance({ c: [3, 0.3] }) });
    expect(t.scoreboard.find((r) => r.id === "c")?.status).not.toBe("promoted");
  });

  it("skips ineligible items and never asks the model about them", () => {
    const d = compose({ ...base, ctx: { premium: false }, surface, relevance: relevance({ f: [3], a: [1.1] }) });
    expect(ids(d)).not.toContain("f");
  });

  it("falls back to the default order without model answers", () => {
    const d = compose({ ...base, surface });
    expect(ids(d)).toEqual(["a", "b", "c"]);
    expect(d.alert).toBeUndefined();
  });

  it("exposes the remaining eligible cards as `more` (See all)", () => {
    const d = compose({ ...base, surface, relevance: relevance({ b: [2.8], c: [2.0], d: [1.5] }) });
    expect(d.more).toEqual(expect.arrayContaining(["a", "e", "f"]));
    expect(d.more).not.toContain("b");
  });

  it("records the focus answer", () => {
    const d = compose({ ...base, surface, relevance: relevance({}, { focus: { type: "choice", choice: "y", confidence: 0.9 } }) });
    expect(d.focus).toBe("y");
  });
});

describe("compose: alerts and suggestions", () => {
  const surface = makeSurface();

  it("shows at most one alert: the most likely above the threshold", () => {
    const d = compose({ ...base, surface, alerts: alerts({ "alert-x": 0.8, "alert-y": 0.95 }) });
    expect(d.alert?.id).toBe("alert-y");
    expect(d.alert?.probability).toBe(0.95);
  });

  it("shows no alert below the threshold", () => {
    expect(compose({ ...base, surface, alerts: alerts({ "alert-x": 0.74, "alert-y": 0.5 }) }).alert).toBeUndefined();
  });

  it("keeps the best suggestions up to suggestionSlots", () => {
    const d = compose({ ...base, surface, relevance: relevance({ s1: [1.5], s2: [2.9], s3: [2.0], a: [0.1] }) });
    expect(d.suggestions.map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("builds reasons only for promoted items", () => {
    const withReasons = makeSurface();
    withReasons.items.find((i) => i.id === "c")!.reasons = [{ when: "anomaly", text: "{area} is {ratio}x normal" }];
    const facts = [{ area: "y", kind: "anomaly", values: { area: "Y", ratio: 3 } }];
    const d = compose({ ...base, surface: withReasons, facts, relevance: relevance({ c: [2.5] }) });
    expect(d.adaptive.find((p) => p.id === "c")?.reasons).toEqual(["Y is 3x normal"]);
  });
});

describe("compose: stability", () => {
  const first = (surface = makeSurface()) =>
    compose({ ...base, surface, relevance: relevance({ a: [2.0], b: [2.0], c: [2.0] }) });

  it("limits position changes per visit and moves the largest gaps first", () => {
    const surface = makeSurface({ maxSwapsPerVisit: 1, hysteresis: 0.1 });
    const previous = first(surface);
    // pins expire only after pinForMs, so use a late `now`.
    const d = compose({
      ...base, surface, previous, now: NOW + surface.policy.pinForMs + 1,
      relevance: relevance({ a: [0.1], b: [0.1], c: [0.1], d: [2.5], e: [3.0], f: [2.2] }),
    });
    expect(new Set(ids(d)).size).toBe(3);
    expect(ids(d)).toContain("e");
    expect(ids(d).filter((x) => !["a", "b", "c"].includes(x))).toEqual(["e"]);
  });

  it("requires the score gap to exceed the hysteresis", () => {
    const surface = makeSurface({ hysteresis: 0.5, maxSwapsPerVisit: 3 });
    const previous = first(surface);
    const now = NOW + surface.policy.pinForMs + 1;
    const close = compose({ ...base, surface, previous, now, relevance: relevance({ a: [2.0], b: [2.0], c: [2.0], d: [2.3] }) });
    expect(ids(close)).not.toContain("d");
    const far = compose({ ...base, surface, previous, now, relevance: relevance({ a: [2.0], b: [2.0], c: [1.0], d: [2.9] }) });
    expect(ids(far)).toContain("d");
  });

  it("protects pinned items until pinForMs elapses", () => {
    const surface = makeSurface({ maxSwapsPerVisit: 3, hysteresis: 0.1 });
    const previous = first(surface);
    const newer = relevance({ a: [0.5], b: [0.5], c: [0.5], d: [3], e: [3], f: [3] });
    const pinned = compose({ ...base, surface, previous, now: NOW + 1000, relevance: newer });
    expect(new Set(ids(pinned))).toEqual(new Set(["a", "b", "c"]));
    const expired = compose({ ...base, surface, previous, now: NOW + surface.policy.pinForMs + 1, relevance: newer });
    expect(new Set(ids(expired))).toEqual(new Set(["d", "e", "f"]));
  });

  it("lets a shown alert lift pins for items in its own area", () => {
    const surface = makeSurface({ maxSwapsPerVisit: 3, hysteresis: 0.1 });
    const previous = first(surface); // a, b (area x) and c (area y), pinned
    const d = compose({
      ...base, surface, previous, now: NOW + 1000,
      relevance: relevance({ a: [0.5], b: [0.5], c: [0.5], d: [3], e: [0.5], f: [0.5] }),
      alerts: alerts({ "alert-y": 0.9 }),
    });
    expect(d.alert?.id).toBe("alert-y");
    expect(ids(d)).toContain("d"); // d is in area y, it displaces a pinned item
  });

  it("changes nothing when the answers are unchanged", () => {
    const surface = makeSurface();
    const previous = first(surface);
    const t = composeWithTrace({ ...base, surface, previous, now: NOW + 5000, relevance: relevance({ a: [2.0], b: [2.0], c: [2.0] }) });
    expect(ids(t.decision)).toEqual(ids(previous));
    expect(t.swaps).toBe(0);
  });
});

describe("compose: feedback", () => {
  it("keeps demoted items out of the zone and reports them", () => {
    const surface = makeSurface();
    const d = compose({
      ...base, surface, demoted: new Set(["b"]),
      relevance: relevance({ a: [1.2], b: [2.9], c: [2.0], d: [1.5] }),
    });
    expect(ids(d)).not.toContain("b");
    expect(d.demoted).toEqual(["b"]);
    expect(d.more).not.toContain("b");
  });
});

describe("defaultDecision", () => {
  it("uses the default order restricted to eligible cards", () => {
    const d = defaultDecision(makeSurface({ adaptiveSlots: 6 }), { premium: false }, "u1", NOW);
    expect(ids(d)).toEqual(["a", "b", "c", "d", "e"]);
    expect(d.source).toBe("default");
  });
});
