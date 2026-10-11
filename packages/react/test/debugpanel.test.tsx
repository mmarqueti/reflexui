import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DecideTrace } from "@reflexui-jev/core";
import { DebugPanel } from "../src/index";

const trace: DecideTrace = {
  decision: { surfaceId: "s", subjectId: "u", fixed: [], adaptive: [], suggestions: [], source: "fresh", createdAt: 0 },
  requests: { relevance: { state: { hot: "x" }, questions: {} } },
  results: { relevance: { answers: {}, model: "jev-1.13.0", usage: { inputTokens: 120 } } },
  facts: [],
  latencyMs: 287,
  swaps: 2,
  scoreboard: [
    { id: "billing", kind: "card", area: "billing", score: 2.86, confidence: 0.86, status: "promoted" },
    { id: "nps", kind: "card", area: "feedback", score: 1.2, confidence: 0.46, status: "below threshold" },
  ],
  alertRows: [{ id: "alert-pay", probability: 0.94, shown: true }],
};

describe("DebugPanel", () => {
  it("renders nothing without a trace", () => {
    const { container } = render(<DebugPanel trace={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the summary, the scoreboard and the alerts", () => {
    render(<DebugPanel trace={trace} policy={{ minScore: 1, minConfidence: 0.6, alertThreshold: 0.75 }} />);
    const summary = document.querySelector(".reflexui-debug-summary")!.textContent!;
    expect(summary).toContain("287 ms");
    expect(summary).toContain("model jev-1.13.0");
    expect(summary).toContain("input tokens 120");
    const rows = [...document.querySelectorAll(".reflexui-debug-scoreboard tbody tr")];
    expect(rows.map((r) => [r.children[0]!.textContent, r.getAttribute("data-status")])).toEqual([
      ["billing", "promoted"],
      ["nps", "below threshold"],
    ]);
    expect(document.querySelector(".reflexui-debug-alerts tbody tr")?.getAttribute("data-shown")).toBe("true");
    expect(screen.getByText(/min confidence 0.6/)).toBeDefined();
  });

  it("shows the fallback reason when the model failed", () => {
    render(<DebugPanel trace={{ ...trace, error: "relevance: timeout" }} />);
    expect(screen.getByText(/fallback: relevance: timeout/)).toBeDefined();
  });
});
