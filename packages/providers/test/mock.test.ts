import { describe, expect, it } from "vitest";
import { choice, noul, score, type Answer } from "@reflexui-jev/core";
import { mockDecider } from "../src/mock";

const questions = {
  s: score("Rate", ["a", "b", "c", "d"]),
  c: choice("Pick", { x: "X", y: "Y", other: null }),
  n: noul("Yes?"),
};

describe("mockDecider", () => {
  it("is deterministic: same state and question, same answer", async () => {
    const d = mockDecider();
    const a = await d.evaluate({ state: { k: 1 }, questions });
    const b = await d.evaluate({ state: { k: 1 }, questions });
    expect(a.answers).toEqual(b.answers);
    const other = await d.evaluate({ state: { k: 2 }, questions });
    expect(other.answers).not.toEqual(a.answers);
  });

  it("answers every question with a value in range", async () => {
    const { answers } = await mockDecider().evaluate({ state: { k: 1 }, questions });
    const s = answers.s as Extract<Answer, { type: "score" }>;
    expect(s.type).toBe("score");
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(3);
    expect(s.confidence).toBeGreaterThanOrEqual(0.5);
    expect(s.confidence).toBeLessThanOrEqual(1);
    const c = answers.c as Extract<Answer, { type: "choice" }>;
    expect(["x", "y", "other"]).toContain(c.choice);
    const n = answers.n as Extract<Answer, { type: "noul" }>;
    expect(n.probability).toBeGreaterThanOrEqual(0);
    expect(n.probability).toBeLessThan(1);
  });

  it("lets overrides force specific answers", async () => {
    const forced: Answer = { type: "noul", probability: 0.99 };
    const { answers } = await mockDecider({ overrides: { n: forced } }).evaluate({ state: {}, questions });
    expect(answers.n).toBe(forced);
    expect(answers.s).toBeDefined();
  });

  it("reports its name and model, and honors latencyMs", async () => {
    const d = mockDecider({ latencyMs: 30 });
    const started = Date.now();
    const r = await d.evaluate({ state: {}, questions });
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
    expect(d.name).toBe("mock");
    expect(r).toMatchObject({ model: "mock", latencyMs: 30 });
  });

  it("works with no questions", async () => {
    expect((await mockDecider().evaluate({ state: {}, questions: {} })).answers).toEqual({});
  });
});
