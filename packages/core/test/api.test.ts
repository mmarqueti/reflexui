import { describe, expect, it } from "vitest";
import * as core from "../src/index";

// Pins the public runtime API. If this fails you changed what users can import:
// update the list on purpose, and mention it in the changeset.
describe("@reflexui-jev/core public API", () => {
  it("exports exactly these values", () => {
    expect(Object.keys(core).sort()).toEqual([
      "FOCUS_KEY",
      "MemoryFeedbackStore",
      "MemoryLog",
      "MemoryStore",
      "alertKey",
      "buildReasons",
      "buildRequests",
      "choice",
      "compose",
      "composeWithTrace",
      "decide",
      "decisionStream",
      "defaultDecision",
      "defaultPolicy",
      "defineSurface",
      "demotedItems",
      "eligibleItems",
      "noul",
      "readDecisionStream",
      "relevanceKey",
      "score",
    ]);
  });
});
