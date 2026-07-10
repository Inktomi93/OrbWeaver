// The backend-internal session cache: the in-memory SessionStore (append/load/dedup) + the per-chat
// resume map + the PD-7 `ensureSeededSession` resume gate (smoke — the full outcome matrix lives in
// session/store.test.ts). The session is backend-internal — these guard the resume substrate's
// correctness, not any domain-visible behavior.

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

describe("SessionCache.ensureSeededSession — smoke (the outcome matrix lives in session/store.test.ts)", () => {
  test("cold cache seeds + records; an unchanged seed resumes; a changed seed reseeds IN PLACE", async () => {
    const cache = new SessionCache();
    const seed = [{ role: "user" as const, content: "hello" }];
    const first = await cache.ensureSeededSession(CHAT_ID, seed);
    expect(first.sessionId).not.toBeNull();
    expect(first.disposition).toBe("seeded");
    expect(cache.resolveResumeId(CHAT_ID)).toBe(first.sessionId);
    expect((await cache.ensureSeededSession(CHAT_ID, seed)).disposition).toBe("resumed");
    // A changed seed on the default (replace-capable) store reseeds IN PLACE — same id, frames swapped,
    // so the conversation's Anthropic cache lineage survives the edit.
    const changed = await cache.ensureSeededSession(CHAT_ID, [
      { role: "user", content: "hello EDITED" },
    ]);
    expect(changed.sessionId).toBe(first.sessionId);
    expect(changed.disposition).toBe("reseeded");
    const rows = await cache.store.load({ projectKey: "any", sessionId: changed.sessionId ?? "" });
    expect(rows).toHaveLength(1);
  });
});
