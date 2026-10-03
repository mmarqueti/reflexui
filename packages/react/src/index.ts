import { useState } from "react";
import type { Decision } from "@reflexui-jev/core";

export interface UseAdaptiveSurfaceOptions {
  surfaceId: string;
  subjectId: string;
  /** Your server endpoint that runs decide() and returns { immediate, fresh }. */
  endpoint: string;
  /** Called when a fresh decision arrives too late to apply in this visit. */
  onDeferred?: (decision: Decision) => void;
}

export interface UseAdaptiveSurfaceResult {
  decision: Decision | undefined;
  status: "loading" | "ready" | "updated" | "error";
  /** Record "useful?" feedback for an item; feeds replay labels. */
  feedback: (itemId: string, useful: boolean) => void;
}

/**
 * Renders the immediate decision at once and swaps the adaptive zone only if
 * the fresh one lands inside the policy window. Headless: you render the cards.
 *
 * Status: planned for milestone M1.
 */
export function useAdaptiveSurface(_options: UseAdaptiveSurfaceOptions): UseAdaptiveSurfaceResult {
  const [decision] = useState<Decision | undefined>(undefined);
  return { decision, status: "loading", feedback: () => {} };
}
