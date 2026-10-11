import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Decision } from "@reflexui-jev/core";
import { useAdaptiveSurface } from "../src/index";

const decision = (source: Decision["source"], ids: string[]): Decision => ({
  surfaceId: "s", subjectId: "u", fixed: [], adaptive: ids.map((id) => ({ id, reasons: [] })),
  suggestions: [], source, createdAt: 0,
});

/** fetch that streams the immediate line now and the fresh line after `freshDelayMs`. */
function streamingFetch(freshDelayMs: number, calls: { url: string; body: unknown }[] = []) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/feedback")) return new Response("{}", { status: 200 });
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        c.enqueue(enc.encode(JSON.stringify({ type: "immediate", decision: decision("default", ["a", "b"]) }) + "\n"));
        await new Promise((r) => setTimeout(r, freshDelayMs));
        c.enqueue(enc.encode(JSON.stringify({ type: "fresh", decision: decision("fresh", ["b", "a"]) }) + "\n"));
        c.close();
      },
    });
    return new Response(body, { status: 200 });
  });
}

const base = { surfaceId: "s", subjectId: "u", endpoint: "/api/surface" };

describe("useAdaptiveSurface", () => {
  it("shows the immediate decision, then applies a fresh one inside the window", async () => {
    const fetch = streamingFetch(10);
    const { result } = renderHook(() => useAdaptiveSurface({ ...base, fetch: fetch as never, applyWithinMs: 1000 }));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("updated"));
    expect(result.current.decision?.source).toBe("fresh");
    expect(result.current.deferred).toBeUndefined();
  });

  it("keeps the immediate decision when the fresh one is too late, and exposes it as deferred", async () => {
    const onDeferred = vi.fn();
    const fetch = streamingFetch(60);
    const { result } = renderHook(() => useAdaptiveSurface({ ...base, fetch: fetch as never, applyWithinMs: 10, onDeferred }));
    await waitFor(() => expect(result.current.deferred?.source).toBe("fresh"));
    expect(result.current.decision?.source).toBe("default");
    expect(result.current.status).toBe("ready");
    expect(onDeferred).toHaveBeenCalledTimes(1);

    act(() => result.current.applyDeferred());
    expect(result.current.decision?.source).toBe("fresh");
    expect(result.current.status).toBe("updated");
    expect(result.current.deferred).toBeUndefined();
  });

  it("reports errors", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const { result } = renderHook(() => useAdaptiveSurface({ ...base, fetch: fetch as never }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatch(/500/);
  });

  it("posts feedback to ${endpoint}/feedback", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetch = streamingFetch(1, calls);
    const { result } = renderHook(() => useAdaptiveSurface({ ...base, fetch: fetch as never }));
    await waitFor(() => expect(result.current.decision).toBeDefined());
    await act(() => result.current.feedback("a", false));
    expect(calls.at(-1)).toEqual({
      url: "/api/surface/feedback",
      body: { surfaceId: "s", subjectId: "u", itemId: "a", useful: false },
    });
  });

  it("refetches when the subject changes", async () => {
    const fetch = streamingFetch(1);
    const { result, rerender } = renderHook(
      ({ subjectId }) => useAdaptiveSurface({ ...base, subjectId, fetch: fetch as never, applyWithinMs: 1000 }),
      { initialProps: { subjectId: "u1" } },
    );
    await waitFor(() => expect(result.current.status).toBe("updated"));
    rerender({ subjectId: "u2" });
    await waitFor(() => expect(fetch.mock.calls.filter(([u]) => !String(u).endsWith("/feedback"))).toHaveLength(2));
  });
});
