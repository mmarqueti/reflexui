import { describe, expect, it } from "vitest";
import * as react from "../src/index";

describe("@reflexui-jev/react public API", () => {
  it("exports exactly these values", () => {
    expect(Object.keys(react).sort()).toEqual(["DebugPanel", "useAdaptiveSurface"]);
  });
});
