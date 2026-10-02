import type { ReasonTemplate, SignalFact } from "./types";

/**
 * Builds "why this item" sentences from fixed templates and signal facts.
 * The model never writes these words.
 */
export function buildReasons(
  area: string,
  templates: readonly ReasonTemplate[] | undefined,
  facts: readonly SignalFact[],
): string[] {
  if (!templates?.length) return [];
  const out: string[] = [];
  for (const fact of facts) {
    if (fact.area !== area) continue;
    const template = templates.find((t) => t.when === fact.kind);
    if (!template) continue;
    out.push(template.text.replace(/\{(\w+)\}/g, (_, key: string) => String(fact.values[key] ?? `{${key}}`)));
  }
  return out;
}
