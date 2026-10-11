import type { Decision, DecisionStore, FeedbackEntry, FeedbackStore } from "@reflexui-jev/core";

/**
 * The few Redis commands reflexui needs, with ioredis-style signatures.
 * An `ioredis` client satisfies it as is; use `fromNodeRedis()` for node-redis (the `redis` package).
 * Any other client works if you wrap it in these five methods.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "PX", ttlMs: number): Promise<unknown>;
  hset(key: string, field: string, value: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  pexpire(key: string, ms: number): Promise<unknown>;
}

/** The subset of node-redis (v4+) used by `fromNodeRedis`. */
export interface NodeRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { PX: number }): Promise<unknown>;
  hSet(key: string, field: string, value: string): Promise<unknown>;
  hGetAll(key: string): Promise<Record<string, string>>;
  pExpire(key: string, ms: number): Promise<unknown>;
}

/** Adapts a node-redis client (`createClient()` from the `redis` package) to `RedisClient`. */
export function fromNodeRedis(client: NodeRedisClient): RedisClient {
  return {
    get: (key) => client.get(key),
    set: (key, value, _mode, ttlMs) => client.set(key, value, { PX: ttlMs }),
    hset: (key, field, value) => client.hSet(key, field, value),
    hgetall: (key) => client.hGetAll(key),
    pexpire: (key, ms) => client.pExpire(key, ms),
  };
}

export interface RedisStoreOptions {
  /** Key prefix. Default "reflexui". */
  prefix?: string;
  /**
   * How long a decision is kept. It only has to outlive `policy.pinForMs` (default 24 h) so pins and the
   * swap limit keep working between visits. Default 30 days.
   */
  ttlMs?: number;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Decision cache in Redis, keyed by `decide()`'s `${surfaceId}:${subjectId}` cache key.
 * Shared across processes and serverless instances, unlike `MemoryStore`.
 */
export function redisStore(client: RedisClient, options: RedisStoreOptions = {}): DecisionStore {
  const prefix = options.prefix ?? "reflexui";
  const ttlMs = options.ttlMs ?? 30 * DAY;
  const redisKey = (key: string) => `${prefix}:decision:${key}`;
  return {
    async get(key) {
      const raw = await client.get(redisKey(key));
      return raw ? (JSON.parse(raw) as Decision) : undefined;
    },
    async set(key, decision) {
      await client.set(redisKey(key), JSON.stringify(decision), "PX", ttlMs);
    },
  };
}

export interface RedisFeedbackStoreOptions {
  prefix?: string;
  /**
   * How long feedback is kept after the last write for a subject. Keep it at least as long as
   * `policy.demoteForMs` (default 7 days) or demotions expire early. Default 30 days.
   */
  ttlMs?: number;
}

/**
 * Feedback in Redis: one hash per subject, one field per item holding the latest entry.
 * `demotedItems()` only looks at the latest entry per item, so nothing is lost by overwriting.
 */
export function redisFeedbackStore(client: RedisClient, options: RedisFeedbackStoreOptions = {}): FeedbackStore {
  const prefix = options.prefix ?? "reflexui";
  const ttlMs = options.ttlMs ?? 30 * DAY;
  const redisKey = (surfaceId: string, subjectId: string) => `${prefix}:feedback:${surfaceId}:${subjectId}`;
  return {
    async record(entry) {
      const key = redisKey(entry.surfaceId, entry.subjectId);
      await client.hset(key, entry.itemId, JSON.stringify(entry));
      await client.pexpire(key, ttlMs);
    },
    async list(surfaceId, subjectId) {
      const all = await client.hgetall(redisKey(surfaceId, subjectId));
      return Object.values(all ?? {}).map((raw) => JSON.parse(raw) as FeedbackEntry);
    },
  };
}
