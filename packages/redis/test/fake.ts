import type { RedisClient } from "../src/index";

/** In-memory RedisClient with millisecond TTLs, a controllable clock and a call log. */
export function fakeRedis() {
  let now = 0;
  const strings = new Map<string, { value: string; expiresAt?: number }>();
  const hashes = new Map<string, { fields: Record<string, string>; expiresAt?: number }>();
  const calls: string[] = [];
  const alive = (e?: { expiresAt?: number }) => e && (e.expiresAt === undefined || e.expiresAt > now);
  const client: RedisClient = {
    async get(key) {
      calls.push(`get ${key}`);
      const e = strings.get(key);
      return alive(e) ? e!.value : null;
    },
    async set(key, value, _mode, ttlMs) {
      calls.push(`set ${key} PX ${ttlMs}`);
      strings.set(key, { value, expiresAt: now + ttlMs });
    },
    async hset(key, field, value) {
      calls.push(`hset ${key} ${field}`);
      const h = hashes.get(key) ?? { fields: {} };
      h.fields[field] = value;
      hashes.set(key, h);
    },
    async hgetall(key) {
      calls.push(`hgetall ${key}`);
      const h = hashes.get(key);
      return alive(h) ? { ...h!.fields } : {};
    },
    async pexpire(key, ms) {
      calls.push(`pexpire ${key} ${ms}`);
      const h = hashes.get(key);
      if (h) h.expiresAt = now + ms;
    },
  };
  return { client, calls, advance: (ms: number) => { now += ms; } };
}
