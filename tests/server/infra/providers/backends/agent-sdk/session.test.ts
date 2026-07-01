// The backend-internal session cache: the in-memory SessionStore (append/load/dedup) + the per-chat
// resume map + the seed-when-stale path. The session is backend-internal — these guard the resume
// substrate's correctness, not any domain-visible behavior.

import {
  buildSeedFrames,
  InMemorySessionStore,
  SessionCache,
} from "@orb/server/infra/providers/backends/agent-sdk/session";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const CHAT_ID = "chat-abc";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

describe("InMemorySessionStore", () => {
  test("append then load round-trips frames for a key", async () => {
    const store = new InMemorySessionStore();
    const frames = buildSeedFrames([{ role: "user", content: "x" }], SESSION_ID);
    await store.append({ projectKey: CHAT_ID, sessionId: SESSION_ID }, frames);
    const loaded = await store.load({ projectKey: CHAT_ID, sessionId: SESSION_ID });
    expect(loaded).toStrictEqual(frames);
  });

  test("a never-written key loads as null (the SDK then starts fresh)", async () => {
    const store = new InMemorySessionStore();
    expect(await store.load({ projectKey: "none", sessionId: "none" })).toBeNull();
  });

  test("uuid-bearing frames dedup on re-append (the SDK replays uuids on retry/import)", async () => {
    const store = new InMemorySessionStore();
    const key = { projectKey: CHAT_ID, sessionId: SESSION_ID };
    const frames = buildSeedFrames([{ role: "user", content: "once" }], SESSION_ID);
    await store.append(key, frames);
    await store.append(key, frames); // replay
    const loaded = await store.load(key);
    expect(loaded).toHaveLength(frames.length);
  });
});

describe("SessionCache — per-chat resume map", () => {
  test("record then resolveResumeId returns the recorded session id", () => {
    const cache = new SessionCache();
    expect(cache.resolveResumeId(CHAT_ID)).toBeUndefined();
    cache.record(CHAT_ID, SESSION_ID);
    expect(cache.resolveResumeId(CHAT_ID)).toBe(SESSION_ID);
  });
});

describe("SessionCache.seedFromCanon — seed + reseed-when-stale", () => {
  test("a fresh chat seeds frames and points the chat at the session", async () => {
    const cache = new SessionCache();
    const written = await cache.seedFromCanon(CHAT_ID, SESSION_ID, [
      { role: "user", content: "hello" },
    ]);
    expect(written.length).toBeGreaterThan(0);
    expect(cache.resolveResumeId(CHAT_ID)).toBe(SESSION_ID);
  });

  test("an UNCHANGED reseed is a no-op (returns [] — the prompt cache survives)", async () => {
    const cache = new SessionCache();
    const canon = [{ role: "user" as const, content: "stable" }];
    await cache.seedFromCanon(CHAT_ID, SESSION_ID, canon);
    const second = await cache.seedFromCanon(CHAT_ID, SESSION_ID, canon);
    expect(second).toStrictEqual([]);
  });

  test("a CHANGED reseed rewrites frames", async () => {
    const cache = new SessionCache();
    await cache.seedFromCanon(CHAT_ID, SESSION_ID, [{ role: "user", content: "v1" }]);
    const changed = await cache.seedFromCanon(CHAT_ID, SESSION_ID, [
      { role: "user", content: "v1" },
      { role: "assistant", content: "v2" },
    ]);
    expect(changed.length).toBeGreaterThan(0);
  });
});
