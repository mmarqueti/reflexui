import { describe, expect, it, vi } from "vitest";
import { choice, noul, score } from "@reflexui-jev/core";
import { typesafeDecider } from "../src/remote";

const okBody = {
  model: "jev-1.13.0",
  answers: {
    s: { type: "score", score: 1.8, confidence: 0.7, legend: {}, probabilities: {} },
    c: { type: "choice", choice: "x", confidence: 0.9, probabilities: { x: 0.9, y: 0.1 } },
    n: { type: "noul", noul: 0.33 },
  },
  usage: { input_tokens: 432, output_tokens: 78 },
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const questions = { s: score("Rate", ["a", "b"]), c: choice("Pick", { x: "X", y: null }), n: noul("Yes?") };

describe("typesafeDecider", () => {
  it("posts the wire format and maps answers back to reflexui types", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, okBody));
    const decider = typesafeDecider({ apiKey: "k", fetch: fetchMock as never });
    const result = await decider.evaluate({ state: { a: 1 }, questions });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.headers.authorization).toBe("Bearer k");
    expect(JSON.parse(init.body)).toEqual({
      model: "jev-latest",
      state: { a: 1 },
      questions: {
        s: { type: "score", instructions: "Rate", criteria: ["a", "b"] },
        c: { type: "choice", instructions: "Pick", criteria: { x: "X", y: null } },
        n: { type: "noul", instructions: "Yes?" },
      },
    });
    expect(result.answers).toEqual({
      s: { type: "score", score: 1.8, confidence: 0.7 },
      c: { type: "choice", choice: "x", confidence: 0.9, probabilities: { x: 0.9, y: 0.1 } },
      n: { type: "noul", probability: 0.33 },
    });
    expect(result.model).toBe("jev-1.13.0");
    expect(result.usage).toEqual({ inputTokens: 432 });
  });

  it("retries on 429 and 529, then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(429, {}))
      .mockResolvedValueOnce(json(529, {}))
      .mockResolvedValueOnce(json(200, okBody));
    const decider = typesafeDecider({ apiKey: "k", fetch: fetchMock as never });
    await decider.evaluate({ state: {}, questions });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 401 and surfaces the server message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(401, { detail: { message: "bad key" } }));
    const decider = typesafeDecider({ apiKey: "k", fetch: fetchMock as never });
    await expect(decider.evaluate({ state: {}, questions })).rejects.toThrow(/typesafe 401.*bad key/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(429, {}));
    const decider = typesafeDecider({ apiKey: "k", maxRetries: 1, fetch: fetchMock as never });
    await expect(decider.evaluate({ state: {}, questions })).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the request was aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    const decider = typesafeDecider({ apiKey: "k", fetch: fetchMock as never });
    await expect(decider.evaluate({ state: {}, questions, signal: controller.signal })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails fast without an API key", async () => {
    const saved = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      await expect(typesafeDecider().evaluate({ state: {}, questions })).rejects.toThrow(/TYPESAFE_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.TYPESAFE_API_KEY = saved;
    }
  });
});
