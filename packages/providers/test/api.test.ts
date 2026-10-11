import { describe, expect, it } from "vitest";
import * as providers from "../src/index";

describe("@reflexui-jev/providers public API", () => {
  it("exports exactly these values", () => {
    expect(Object.keys(providers).sort()).toEqual(["mockDecider", "typesafeDecider"]);
  });
});
