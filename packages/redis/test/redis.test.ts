import { createClient } from "redis";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import {
  decide, defineSurface, demotedItems, type Answer, type Decider, type Decision, type FeedbackEntry,
} from "@reflexui-jev/core";
import { fromNodeRedis, redisFeedbackStore, redisStore, type RedisClient } from "../src/index";
import { fakeRedis } from "./fake";

const decision: Decision = {
  surfaceId: "s", subjectId: "u1", fixed: ["k"], adaptive: [{ id: "a", score: 2.5, confidence: 0.9, reasons: ["why"], pinnedUntil: 99 }],
  alert: { id: "al", probability: 0.9, reasons: [] }, suggestions: [], focus: "x", more: ["b"], demoted: [], source: "fresh", createdAt: 123,
};
const entry = (itemId: string, useful: boolean, at: number, subjectId = "u1"): FeedbackEntry => ({ surfaceId: "s", subjectId, itemId, useful, at });

describe("redisStore (fake client)", () => {
  it("round-trips a decision and returns undefined on a miss", async () => {
    const { client } = fakeRedis();
    const store = redisStore(client);
    expect(await store.get("s:u1")).toBeUndefined();
    await store.set("s:u1", decision);
    expect(await store.get("s:u1")).toEqual(decision);
  });

  it("uses the prefix and the ttl", async () => {
    const { client, calls } = fakeRedis();
    await redisStore(client, { prefix: "app", ttlMs: 5000 }).set("s:u1", decision);
    expect(calls).toEqual(["set app:decision:s:u1 PX 5000"]);
  });

  it("expires decisions", async () => {
    const { client, advance } = fakeRedis();
    const store = redisStore(client, { ttlMs: 1000 });
    await store.set("s:u1", decision);
    advance(1001);
    expect(await store.get("s:u1")).toBeUndefined();
  });

  it("keeps prefixes apart", async () => {
    const { client } = fakeRedis();
    await redisStore(client, { prefix: "a" }).set("k", decision);
    expect(await redisStore(client, { prefix: "b" }).get("k")).toBeUndefined();
  });
});

describe("redisFeedbackStore (fake client)", () => {
  it("lists entries per subject, one per item, latest wins", async () => {
    const { client } = fakeRedis();
    const store = redisFeedbackStore(client);
    await store.record(entry("a", false, 1));
    await store.record(entry("a", true, 2));
    await store.record(entry("b", false, 3));
    await store.record(entry("c", false, 4, "u2"));
    const list = await store.list("s", "u1");
    expect(list.map((e) => `${e.itemId}:${e.useful}`).sort()).toEqual(["a:true", "b:false"]);
    expect([...demotedItems(list, 10, 100)]).toEqual(["b"]);
    expect(await store.list("s", "nobody")).toEqual([]);
  });

  it("refreshes the ttl on every write", async () => {
    const { client, calls } = fakeRedis();
    await redisFeedbackStore(client, { prefix: "p", ttlMs: 777 }).record(entry("a", false, 1));
    expect(calls).toEqual(["hset p:feedback:s:u1 a", "pexpire p:feedback:s:u1 777"]);
  });

  it("drops feedback after the ttl", async () => {
    const { client, advance } = fakeRedis();
    const store = redisFeedbackStore(client, { ttlMs: 1000 });
    await store.record(entry("a", false, 1));
    advance(1001);
    expect(await store.list("s", "u1")).toEqual([]);
  });
});

// A surface and decider to prove the stores work through decide(), across "instances".
const surface = defineSurface<object>({
  id: "s",
  fixed: () => [],
  defaultOrder: () => ["a", "b", "c"],
  items: ["a", "b", "c"].map((id) => ({ id, kind: "card" as const, area: "x", title: id.toUpperCase() })),
  signals: [],
  relevanceLevels: ["no", "yes"],
  relevancePrompt: "{title}?",
  policy: { adaptiveSlots: 2, minRefreshMs: 0, minScore: 0.5 },
});
const decider: Decider = {
  name: "scripted",
  async evaluate({ questions }) {
    const answers: Record<string, Answer> = {};
    for (const key of Object.keys(questions)) {
      answers[key] = { type: "score", score: key === "rel:c" ? 1 : key === "rel:b" ? 0.8 : 0.6, confidence: 0.9 };
    }
    return { answers };
  },
};

function behavesLikeAStore(name: string, make: () => Promise<{ a: RedisClient; b: RedisClient; cleanup?: () => Promise<void> }>) {
  describe(`decide() with ${name}`, () => {
    it("shares the cache and the feedback between two instances", async () => {
      const { a, b, cleanup } = await make();
      try {
        const subjectId = `u-${Math.random().toString(36).slice(2)}`;
        // Instance A answers the first visit.
        const first = await decide({ surface, ctx: {}, subjectId, decider, store: redisStore(a), feedback: redisFeedbackStore(a) });
        expect(first.immediate.source).toBe("default");
        const fresh = await first.fresh;
        expect(fresh.adaptive.map((p) => p.id)).toEqual(["c", "b"]);

        // Instance B (new process, new client) sees A's decision as the cache.
        const second = await decide({ surface, ctx: {}, subjectId, decider, store: redisStore(b), feedback: redisFeedbackStore(b) });
        expect(second.immediate.source).toBe("cache");
        expect(second.immediate.adaptive.map((p) => p.id)).toEqual(["c", "b"]);

        // Feedback recorded on A demotes the item on B.
        await redisFeedbackStore(a).record({ surfaceId: "s", subjectId, itemId: "c", useful: false, at: Date.now() });
        const third = await decide({ surface, ctx: {}, subjectId, decider, store: redisStore(b), feedback: redisFeedbackStore(b) });
        const after = await third.fresh;
        expect(after.demoted).toEqual(["c"]);
        expect(after.adaptive.map((p) => p.id)).not.toContain("c");
      } finally {
        await cleanup?.();
      }
    });
  });
}

behavesLikeAStore("a fake client", async () => {
  const { client } = fakeRedis();
  return { a: client, b: client };
});

// Real Redis: set REDIS_URL (e.g. redis://localhost:6379). Skipped otherwise.
const url = process.env.REDIS_URL;
describe.skipIf(!url)("against a real Redis", () => {
  const closers: Array<() => Promise<unknown>> = [];
  afterAll(async () => { for (const close of closers) await close(); });

  const ioredis = () => {
    const c = new Redis(url!);
    closers.push(async () => c.quit());
    return c as unknown as RedisClient;
  };
  const nodeRedis = async () => {
    const c = createClient({ url });
    await c.connect();
    closers.push(async () => c.quit());
    return fromNodeRedis(c as never);
  };

  behavesLikeAStore("ioredis (two clients)", async () => ({ a: ioredis(), b: ioredis() }));
  behavesLikeAStore("node-redis (two clients)", async () => ({ a: await nodeRedis(), b: await nodeRedis() }));
  behavesLikeAStore("ioredis writing, node-redis reading", async () => ({ a: ioredis(), b: await nodeRedis() }));

  it("honors the ttl in Redis", async () => {
    const c = ioredis();
    const store = redisStore(c, { prefix: `ttl-${Date.now()}`, ttlMs: 150 });
    await store.set("k", decision);
    expect(await store.get("k")).toEqual(decision);
    await new Promise((r) => setTimeout(r, 250));
    expect(await store.get("k")).toBeUndefined();
  });

  it("expires feedback hashes", async () => {
    const c = ioredis();
    const fb = redisFeedbackStore(c, { prefix: `fb-${Date.now()}`, ttlMs: 150 });
    await fb.record(entry("a", false, 1));
    expect(await fb.list("s", "u1")).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 250));
    expect(await fb.list("s", "u1")).toEqual([]);
  });
});

