// store.ts — the in-memory SDK SessionStore (append/load/dedup substrate) + the per-chat SessionCache
// (resume map + seed-when-stale). The session is BACKEND-INTERNAL; these guard the resume substrate's
// correctness: composite-key isolation, uuid dedup vs uuid-less append, defensive-copy reads, and the
// reseed-when-stale no-op that keeps the Max-sub prompt cache alive.

import {
  buildSeedFrames,
  InMemorySessionStore,
  SessionCache,
} from "@orb/server/infra/providers/backends/agent-sdk/session";
import { describe } from "vitest";
import { expect, test } from "../../../../../../support/fixtures";

const CHAT_ID = "chat-store";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

// The SDK SessionStoreEntry type, derived WITHOUT importing the sealed SDK (mirror runner.test's pattern).
type Entry = Parameters<InMemorySessionStore["append"]>[1][number];

function uuidlessEntry(): Entry {
  return { type: "user", message: { role: "user", content: [] } } as unknown as Entry;
}

describe("InMemorySessionStore", () => {
  test("append then load round-trips frames for a key", async () => {
    const store = new InMemorySessionStore();
    const key = { projectKey: CHAT_ID, sessionId: SESSION_ID };
    const frames = buildSeedFrames([{ role: "user", content: "x" }], SESSION_ID);
    await store.append(key, frames);
    expect(await store.load(key)).toStrictEqual(frames);
  });

  test("a never-written key loads as null (the SDK then starts a fresh session)", async () => {
    const store = new InMemorySessionStore();
    expect(await store.load({ projectKey: "none", sessionId: "none" })).toBeNull();
  });

  test("appending an EMPTY batch is a no-op — the key stays unwritten (null), not an empty bucket", async () => {
    const store = new InMemorySessionStore();
    const key = { projectKey: CHAT_ID, sessionId: SESSION_ID };
    await store.append(key, []);
    expect(await store.load(key)).toBeNull();
  });

  test("uuid-bearing frames DEDUP on re-append (the SDK replays uuids on retry/import)", async () => {
    const store = new InMemorySessionStore();
    const key = { projectKey: CHAT_ID, sessionId: SESSION_ID };
    const frames = buildSeedFrames([{ role: "user", content: "once" }], SESSION_ID);
    await store.append(key, frames);
    await store.append(key, frames);
    expect(await store.load(key)).toHaveLength(frames.length);
  });

  test("uuid-LESS frames always append (no uuid → no dedup key)", async () => {
    const store = new InMemorySessionStore();
    const key = { projectKey: CHAT_ID, sessionId: SESSION_ID };
    await store.append(key, [uuidlessEntry()]);
    await store.append(key, [uuidlessEntry()]);
    expect(await store.load(key)).toHaveLength(2);
  });

  test("load returns a defensive COPY — mutating the result does not corrupt the store", async () => {
    const store = new InMemorySessionStore();
    const key = { projectKey: CHAT_ID, sessionId: SESSION_ID };
    const frames = buildSeedFrames([{ role: "user", content: "x" }], SESSION_ID);
    await store.append(key, frames);
    const loaded = await store.load(key);
    loaded?.push(uuidlessEntry());
    expect(await store.load(key)).toHaveLength(frames.length);
  });

  test("the composite key isolates subpaths — the main transcript and a branch don't collide", async () => {
    const store = new InMemorySessionStore();
    const main = { projectKey: CHAT_ID, sessionId: SESSION_ID };
    const branch = { projectKey: CHAT_ID, sessionId: SESSION_ID, subpath: "branch-1" };
    await store.append(main, buildSeedFrames([{ role: "user", content: "main" }], SESSION_ID));
    expect(await store.load(branch)).toBeNull();
  });
});

describe("SessionCache — resume map + default store", () => {
  test("defaults to an in-memory store when none is injected", () => {
    expect(new SessionCache().store).toBeInstanceOf(InMemorySessionStore);
  });

  test("uses the injected store (the durable cross-restart seam)", () => {
    const injected = new InMemorySessionStore();
    expect(new SessionCache(injected).store).toBe(injected);
  });

  test("record then resolveResumeId returns the recorded session id; a miss is undefined", () => {
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

  test("an UNCHANGED reseed is a no-op ([]), keeping the prompt cache alive", async () => {
    const cache = new SessionCache();
    const canon = [{ role: "user" as const, content: "stable" }];
    await cache.seedFromCanon(CHAT_ID, SESSION_ID, canon);
    expect(await cache.seedFromCanon(CHAT_ID, SESSION_ID, canon)).toStrictEqual([]);
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

  test("an empty canon writes nothing but still points the chat at the session", async () => {
    const cache = new SessionCache();
    const written = await cache.seedFromCanon(CHAT_ID, SESSION_ID, []);
    expect(written).toStrictEqual([]);
    expect(cache.resolveResumeId(CHAT_ID)).toBe(SESSION_ID);
  });
});
