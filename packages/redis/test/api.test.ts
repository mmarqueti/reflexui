import { describe, expect, it } from "vitest";
import * as redis from "../src/index";

describe("@reflexui-jev/redis public API", () => {
  it("exports exactly these values", () => {
    expect(Object.keys(redis).sort()).toEqual(["fromNodeRedis", "redisFeedbackStore", "redisStore"]);
  });
});
