import { describe, expect, it } from "vitest";
import * as replay from "../src/index";

describe("@reflexui-jev/replay public API", () => {
  it("exports exactly these values", () => {
    expect(Object.keys(replay).sort()).toEqual(["cachingDecider", "formatReport", "parseReplayCases", "runReplay"]);
  });
});
