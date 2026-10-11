import type { DecideTrace, Policy } from "@reflexui-jev/core";

export interface DebugPanelProps {
  /** The trace streamed by `decisionStream(result, { trace: true })` (see `useAdaptiveSurface().trace`). */
  trace: DecideTrace | undefined;
  policy?: Partial<Policy>;
  /** Class applied to the root. Elements also carry `reflexui-debug-*` classes; no styles are injected. */
  className?: string;
}

const fixed = (n: number, digits = 2) => n.toFixed(digits);
const json = (value: unknown) => JSON.stringify(value, null, 2);

/**
 * Headless debug panel: why the screen looks the way it does. Shows the source of the decision,
 * the relevance scoreboard against the policy, alert probabilities, and the raw model I/O.
 * Plain semantic HTML with `reflexui-debug-*` class names, so you style it yourself.
 *
 * The trace contains the signals sent to the model. Render this for developers only.
 */
export function DebugPanel({ trace, policy, className }: DebugPanelProps) {
  if (!trace) return null;
  const tokens = Object.values(trace.results).reduce((n, r) => n + (r?.usage?.inputTokens ?? 0), 0);
  const model = trace.results.relevance?.model ?? trace.results.alerts?.model;
  return (
    <section className={className ?? "reflexui-debug"} aria-label="reflexui debug">
      <p className="reflexui-debug-summary">
        source <b>{trace.decision.source}</b> · {trace.latencyMs} ms · model {model ?? "-"} · input tokens {tokens}
        {trace.swaps !== undefined && <> · {trace.swaps} change(s)</>}
        {trace.error && <> · <b className="reflexui-debug-error">fallback: {trace.error}</b></>}
      </p>

      {trace.scoreboard && (
        <>
          <h3>Relevance{policy?.minScore !== undefined && <> (min score {policy.minScore}, min confidence {policy.minConfidence})</>}</h3>
          <table className="reflexui-debug-scoreboard">
            <thead><tr><th>Item</th><th>Area</th><th>Score</th><th>Confidence</th><th>Outcome</th></tr></thead>
            <tbody>
              {trace.scoreboard.map((r) => (
                <tr key={r.id} data-status={r.status}>
                  <td>{r.id}</td><td>{r.area}</td><td>{fixed(r.score)}</td><td>{fixed(r.confidence)}</td><td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {trace.alertRows && trace.alertRows.length > 0 && (
        <>
          <h3>Alerts{policy?.alertThreshold !== undefined && <> (threshold {policy.alertThreshold})</>}</h3>
          <table className="reflexui-debug-alerts">
            <thead><tr><th>Alert</th><th>Probability</th><th>Shown</th></tr></thead>
            <tbody>
              {trace.alertRows.map((a) => (
                <tr key={a.id} data-shown={a.shown}><td>{a.id}</td><td>{fixed(a.probability)}</td><td>{a.shown ? "yes" : "no"}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {policy && <details><summary>Policy</summary><pre>{json(policy)}</pre></details>}
      <details><summary>Request: relevance</summary><pre>{json(trace.requests.relevance)}</pre></details>
      <details><summary>Request: alerts</summary><pre>{json(trace.requests.alerts)}</pre></details>
      <details><summary>Answers: relevance</summary><pre>{json(trace.results.relevance)}</pre></details>
      <details><summary>Answers: alerts</summary><pre>{json(trace.results.alerts)}</pre></details>
      <details><summary>Facts used by reason templates</summary><pre>{json(trace.facts)}</pre></details>
      <details><summary>Decision</summary><pre>{json(trace.decision)}</pre></details>
    </section>
  );
}
