// store.ts — the in-memory SDK SessionStore (append/load/dedup substrate) + the per-chat SessionCache
// (resume map + the PD-7 `ensureSeededSession` resume gate). The session is BACKEND-INTERNAL; these
// guard the resume substrate's correctness: sessionId-keyed rows (projectKey deliberately ignored — the
// SDK's sanitized-cwd key and our seeded key must address the same records), uuid dedup vs uuid-less
// append, defensive-copy reads, and the resume/reseed/re-adopt outcomes that keep the Max-sub prompt
// cache alive while never resuming a diverged transcript.

import {
  buildSeedFrames,
  InMemorySessionStore,
  SessionCache,
  seedSessionId,
} from "@orb/server/infra/providers/backends/agent-sdk/session";
import { describe } from "vitest";
import { expect, test } from "../../../../../../support/fixtures";

const CHAT_ID = "chat-store";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

// The SDK SessionStoreEntry + SessionKey types, derived WITHOUT importing the sealed SDK (mirror runner.test).
type Entry = Parameters<InMemorySessionStore["append"]>[1][number];
type Key = Parameters<InMemorySessionStore["append"]>[0];

function uuidlessEntry(): Entry {
  return { type: "user", message: { role: "user", content: [] } };
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

  test("projectKey is IGNORED — our seeded key and the SDK's sanitized-cwd key address the same rows", async () => {
    const store = new InMemorySessionStore();
    const frames = buildSeedFrames([{ role: "user", content: "shared" }], SESSION_ID);
    await store.append({ projectKey: "orbweaver", sessionId: SESSION_ID }, frames);
    const viaSdkKey = await store.load({
      projectKey: "-home-user-some-sanitized-cwd",
      sessionId: SESSION_ID,
    });
    expect(viaSdkKey).toStrictEqual(frames);
  });
});

// The store is bounded at MAX_SESSION_LINEAGES (256) lineages, LRU by lineage. These exercise the bound at
// its edges without hardcoding the cap: fill to the cap via a helper, then probe the +1 boundary.
const LINEAGE_CAP = 256;
function lineageKey(n: number): Key {
  // A distinct, valid-shaped uuid per lineage index (padded n in the last group).
  return { projectKey: "p", sessionId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` };
}
async function fillToCap(store: InMemorySessionStore): Promise<void> {
  for (let n = 0; n < LINEAGE_CAP; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential setup — LRU order depends on append order.
    await store.append(lineageKey(n), [
      { type: "user", uuid: `u-${n}`, message: { role: "user", content: `l${n}` } },
    ]);
  }
}

describe("InMemorySessionStore — LRU lineage bound", () => {
  test("appending the (cap+1)th lineage evicts the OLDEST-touched one", async () => {
    const store = new InMemorySessionStore();
    await fillToCap(store);
    // Lineage 0 is the least-recently-touched; the cap+1 append must drop it.
    await store.append(lineageKey(LINEAGE_CAP), [
      { type: "user", uuid: "u-new", message: { role: "user", content: "new" } },
    ]);
    expect(await store.load(lineageKey(0))).toBeNull();
    // A non-oldest lineage and the newcomer both survive.
    expect(await store.load(lineageKey(1))).not.toBeNull();
    expect(await store.load(lineageKey(LINEAGE_CAP))).not.toBeNull();
  });

  test("a touch (load) refreshes recency — the touched lineage survives the next eviction", async () => {
    const store = new InMemorySessionStore();
    await fillToCap(store);
    // Touch lineage 0 so it is no longer the oldest; lineage 1 becomes the eviction victim.
    await store.load(lineageKey(0));
    await store.append(lineageKey(LINEAGE_CAP), [
      { type: "user", uuid: "u-new", message: { role: "user", content: "new" } },
    ]);
    expect(await store.load(lineageKey(0))).not.toBeNull();
    expect(await store.load(lineageKey(1))).toBeNull();
  });

  test("replace also touches — a replaced lineage is protected from the next eviction", async () => {
    const store = new InMemorySessionStore();
    await fillToCap(store);
    await store.replace(lineageKey(0), [
      { type: "user", uuid: "u-r", message: { role: "user", content: "replaced" } },
    ]);
    await store.append(lineageKey(LINEAGE_CAP), [
      { type: "user", uuid: "u-new", message: { role: "user", content: "new" } },
    ]);
    expect(await store.load(lineageKey(0))).not.toBeNull();
    expect(await store.load(lineageKey(1))).toBeNull();
  });

  test("all composite keys of ONE lineage evict together (main transcript + a subpath)", async () => {
    const store = new InMemorySessionStore();
    const victim = "00000000-0000-4000-8000-0000000000aa";
    await store.append({ projectKey: "p", sessionId: victim }, [
      { type: "user", uuid: "m", message: { role: "user", content: "main" } },
    ]);
    await store.append({ projectKey: "p", sessionId: victim, subpath: "sub-1" }, [
      { type: "user", uuid: "s", message: { role: "user", content: "sub" } },
    ]);
    // Fill the REST of the cap, then push one past — the two-key victim lineage is the oldest and drops whole.
    for (let n = 0; n < LINEAGE_CAP; n += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential setup.
      await store.append(lineageKey(n), [
        { type: "user", uuid: `u-${n}`, message: { role: "user", content: `l${n}` } },
      ]);
    }
    expect(await store.load({ projectKey: "p", sessionId: victim })).toBeNull();
    expect(await store.load({ projectKey: "p", sessionId: victim, subpath: "sub-1" })).toBeNull();
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

describe("SessionCache.ensureSeededSession — the PD-7 resume gate", () => {
  const seed = [
    { role: "user" as const, content: "hello" },
    { role: "assistant" as const, content: "hi there" },
  ];

  test("a cold cache seeds a deterministic session, records it, and returns its id + `seeded`", async () => {
    const cache = new SessionCache();
    const decision = await cache.ensureSeededSession(CHAT_ID, seed);
    expect(decision.sessionId).not.toBeNull();
    expect(decision.disposition).toBe("seeded");
    expect(cache.resolveResumeId(CHAT_ID)).toBe(decision.sessionId);
    const rows = await cache.store.load({ projectKey: "any", sessionId: decision.sessionId ?? "" });
    expect(rows).toHaveLength(seed.length);
  });

  test("an UNCHANGED seed resumes the SAME session (`resumed` — the prompt cache survives)", async () => {
    const cache = new SessionCache();
    const first = await cache.ensureSeededSession(CHAT_ID, seed);
    const second = await cache.ensureSeededSession(CHAT_ID, seed);
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.disposition).toBe("resumed");
  });

  test("a session GROWN by SDK frames that MERGE to exactly the new seed RESUMES (no fork)", async () => {
    const cache = new SessionCache();
    const first = await cache.ensureSeededSession(CHAT_ID, seed);
    // Simulate the SDK mirror after the turn: the joined prompt as a string-content user frame + the
    // reply split across two block frames (the shapes the live subprocess writes). These MERGE (per the
    // run-fold comparator) to exactly the continued canon below.
    await cache.store.append({ projectKey: "sdk-cwd-key", sessionId: first.sessionId ?? "" }, [
      {
        type: "user",
        uuid: "sdk-u1",
        message: { role: "user", content: "next question" },
      },
      {
        type: "assistant",
        uuid: "sdk-a1",
        message: { role: "assistant", content: [{ type: "text", text: "answer " }] },
      },
      {
        type: "assistant",
        uuid: "sdk-a2",
        message: { role: "assistant", content: [{ type: "text", text: "part two" }] },
      },
    ]);
    const continued = [
      ...seed,
      { role: "user" as const, content: "next question" },
      { role: "assistant" as const, content: "answer part two" },
    ];
    const next = await cache.ensureSeededSession(CHAT_ID, continued);
    // The grown transcript's merged runs equal the continued seed → clean resume of the SAME id; the fork
    // path is NOT taken (a match is not a divergence).
    expect(next.sessionId).toBe(first.sessionId);
    expect(next.disposition).toBe("resumed");
  });

  test("a swipe FORKS to a new lineage; the ORIGINAL lineage is preserved intact", async () => {
    const cache = new SessionCache();
    const first = await cache.ensureSeededSession(CHAT_ID, seed);
    // The live subprocess mirrors the turn: the joined prompt + the (about-to-be-rejected) reply.
    await cache.store.append({ projectKey: "sdk-cwd-key", sessionId: first.sessionId ?? "" }, [
      { type: "user", uuid: "sdk-u1", message: { role: "user", content: "prompt" } },
      {
        type: "assistant",
        uuid: "sdk-a1",
        message: { role: "assistant", content: [{ type: "text", text: "rejected reply" }] },
      },
    ]);
    // The swipe: canon keeps the prompt but NOT the rejected reply → a branch off the recorded lineage.
    const swipeSeed = [...seed, { role: "user" as const, content: "prompt" }];
    const next = await cache.ensureSeededSession(CHAT_ID, swipeSeed);
    // NEW deterministic id + `forked`; the branch holds EXACTLY the swipe seed.
    expect(next.sessionId).not.toBe(first.sessionId);
    expect(next.sessionId).toBe(seedSessionId(CHAT_ID, swipeSeed, 0));
    expect(next.disposition).toBe("forked");
    const branch = await cache.store.load({ projectKey: "any", sessionId: next.sessionId ?? "" });
    expect(branch).toHaveLength(swipeSeed.length);
    // The recorded lineage was NOT overwritten — it still carries the original turn + the rejected reply.
    const original = await cache.store.load({
      projectKey: "any",
      sessionId: first.sessionId ?? "",
    });
    expect(original).not.toBeNull();
    expect((original ?? []).length).toBeGreaterThan(swipeSeed.length);
  });

  test("A→B→A swipe: the third turn RE-ADOPTS the original lineage — no reseed rewrite", async () => {
    const cache = new SessionCache();
    // Turn 1: canon A (a full user→assistant exchange so a swipe keeps a non-trivial shared prefix).
    const canonA = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "reply A" },
      { role: "user" as const, content: "keep going" },
    ];
    const a1 = await cache.ensureSeededSession(CHAT_ID, canonA);
    expect(a1.disposition).toBe("seeded");
    const idA = a1.sessionId;
    // Turn 2: swipe to canon B — same prefix, a diverged last-assistant tail → FORK to lineage B.
    const canonB = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "reply B (a different swipe)" },
      { role: "user" as const, content: "keep going" },
    ];
    const b = await cache.ensureSeededSession(CHAT_ID, canonB);
    expect(b.disposition).toBe("forked");
    expect(b.sessionId).not.toBe(idA);
    // Turn 3: swipe BACK to canon A. The deterministic id family re-derives idA and its frames survive →
    // plain RE-ADOPT, no rewrite. This is the invariant the fork exists to protect. NOTE: here idA still
    // holds EXACTLY canonA (the unit fixture never grew it), so this passes even under the old exact-only
    // walk — the GROWN-lineage case below is what the old build got wrong live (probe s9).
    const a2 = await cache.ensureSeededSession(CHAT_ID, canonA);
    expect(a2.sessionId).toBe(idA);
    expect(a2.disposition).toBe("readopted");
  });

  test("A→B→A where the LIVE SDK grew lineage A: turn 3 RE-ADOPTS grown A intact (probe s9)", async () => {
    // MIRRORS THE LIVE SEQUENCE the original unit test missed: after turn 1 the subprocess appends its own
    // user+assistant frames to lineage A, so on the swipe-back A's stored transcript is a SUPERSET of the
    // pre-turn seed — an exact-only match walk (the old build) MISSED it and re-FORKED (dispositions were
    // [seeded, forked, forked]); want [seeded, forked, readopted]. The prefix-match candidate probe fixes it.
    const cache = new SessionCache();
    const canonA = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "reply A" },
      { role: "user" as const, content: "keep going" },
    ];
    const a1 = await cache.ensureSeededSession(CHAT_ID, canonA);
    expect(a1.disposition).toBe("seeded");
    const idA = a1.sessionId ?? "";
    // The live subprocess GROWS lineage A: canonA ends on a user turn ("keep going"), so the model's
    // just-run reply is the ASSISTANT answer to it, and the next user prompt follows (uuid-bearing, the
    // SDK's realistic shapes — a block-content reply then a string-content user frame). The seed therefore
    // stays a clean LEADING PREFIX of the grown lineage (the trailing user run is not folded into a reply).
    await cache.store.append({ projectKey: "sdk-cwd-key", sessionId: idA }, [
      {
        type: "assistant",
        uuid: "5f2b1a90-0000-4000-8000-000000000101",
        message: { role: "assistant", content: [{ type: "text", text: "the tale continues" }] },
      },
      {
        type: "user",
        uuid: "5f2b1a90-0000-4000-8000-000000000102",
        message: { role: "user", content: "and then?" },
      },
    ]);
    const grownRows = await cache.store.load({ projectKey: "any", sessionId: idA });
    const grownLen = (grownRows ?? []).length;
    expect(grownLen).toBe(canonA.length + 2);
    // Turn 2: swipe to canon B — same prefix, diverged last-assistant tail → FORK to lineage B.
    const canonB = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "reply B (a different swipe)" },
      { role: "user" as const, content: "keep going" },
    ];
    const b = await cache.ensureSeededSession(CHAT_ID, canonB);
    expect(b.disposition).toBe("forked");
    expect(b.sessionId).not.toBe(idA);
    // Turn 3: swipe BACK to canon A. The recorded lineage is now B; the candidate probe re-derives idA and
    // finds canonA a LEADING PREFIX of its grown transcript → RE-ADOPT idA (no reseed rewrite).
    const a2 = await cache.ensureSeededSession(CHAT_ID, canonA);
    expect(a2.sessionId).toBe(idA);
    expect(a2.disposition).toBe("readopted");
    // A's grown frames are INTACT — re-adoption records the id, it does NOT replace/truncate the lineage.
    const afterRows = await cache.store.load({ projectKey: "any", sessionId: idA });
    expect((afterRows ?? []).length).toBe(grownLen);
  });

  test("a FIRST-turn edit (no shared prefix) reseeds IN PLACE; a revert reseeds in place again", async () => {
    const cache = new SessionCache();
    const first = await cache.ensureSeededSession(CHAT_ID, seed);
    const edited = [
      { role: "user" as const, content: "hello EDITED" },
      { role: "assistant" as const, content: "hi there" },
    ];
    // The first run diverges (edited user turn), so there is NO shared prefix → NOT a branch → in-place
    // replace under the same id (nothing to preserve for a swipe-back).
    const editedId = await cache.ensureSeededSession(CHAT_ID, edited);
    expect(editedId.sessionId).toBe(first.sessionId);
    expect(editedId.disposition).toBe("reseeded");
    // Revert diverges from the edited transcript at the first run again → in-place replace back, same id.
    const reverted = await cache.ensureSeededSession(CHAT_ID, seed);
    expect(reverted.sessionId).toBe(first.sessionId);
    expect(reverted.disposition).toBe("reseeded");
    const rows = await cache.store.load({ projectKey: "any", sessionId: reverted.sessionId ?? "" });
    expect(rows).toHaveLength(seed.length);
  });

  test("an evicted recorded lineage recovers on the next turn (safety by construction)", async () => {
    const store = new InMemorySessionStore();
    const cache = new SessionCache(store);
    const first = await cache.ensureSeededSession(CHAT_ID, seed);
    // Model the LRU dropping the recorded lineage's frames out from under the cache: replace it to empty
    // (the byChat mapping still points at the now-frameless id — the tolerance the store relies on).
    await store.replace({ projectKey: "any", sessionId: first.sessionId ?? "" }, []);
    // Same seed, but the recorded id now has NO frames → an empty transcript diverges from the seed, with
    // no shared prefix → the store rebuilds it deterministically (reseed-in-place under the recorded id)
    // rather than losing the conversation. This is the "eviction is safe by construction" proof.
    const next = await cache.ensureSeededSession(CHAT_ID, seed);
    expect(next.sessionId).toBe(first.sessionId);
    expect(next.disposition).toBe("reseeded");
    const rows = await store.load({ projectKey: "any", sessionId: next.sessionId ?? "" });
    expect(rows).toHaveLength(seed.length);
  });

  test("a replace-INCAPABLE store forks (deterministic lineage) on a branch divergence", async () => {
    // An append-only store (no `replace`) — the durable-store-not-yet-implemented shape.
    const inner = new InMemorySessionStore();
    const appendOnly = {
      append: (k: Key, e: Entry[]): Promise<void> => inner.append(k, e),
      load: (k: Key): Promise<Entry[] | null> => inner.load(k),
    };
    const cache = new SessionCache(appendOnly);
    const first = await cache.ensureSeededSession(CHAT_ID, seed);
    await appendOnly.append({ projectKey: "sdk", sessionId: first.sessionId ?? "" }, [
      {
        type: "assistant",
        uuid: "extra",
        message: { role: "assistant", content: [{ type: "text", text: "rejected" }] },
      },
    ]);
    const swipeSeed = [...seed, { role: "user" as const, content: "prompt" }];
    const next = await cache.ensureSeededSession(CHAT_ID, swipeSeed);
    // A branch divergence forks to a fresh DETERMINISTIC id whether or not the store can replace — the fork
    // uses seedFresh (append + load), so `replace` is irrelevant here. NOT the recorded id → `forked`.
    expect(next.sessionId).not.toBe(first.sessionId);
    expect(next.disposition).toBe("forked");
    expect(next.sessionId).toBe(
      seedSessionId(CHAT_ID, [...seed, { role: "user", content: "prompt" }], 0),
    );
  });

  test("an ASSISTANT-FIRST seed (greeting) is stub-normalized consistently across calls", async () => {
    const cache = new SessionCache();
    const greeting = [{ role: "assistant" as const, content: "a lone greeting" }];
    const first = await cache.ensureSeededSession(CHAT_ID, greeting);
    expect(first.sessionId).not.toBeNull();
    // The stored session carries the stub + greeting; the same seed resumes it.
    expect((await cache.ensureSeededSession(CHAT_ID, greeting)).sessionId).toBe(first.sessionId);
    const rows = await cache.store.load({ projectKey: "any", sessionId: first.sessionId ?? "" });
    expect(rows).toHaveLength(2);
  });

  test("an EMPTY seed returns null + `cleared` and DROPS the mapping (a cleared chat never resumes)", async () => {
    const cache = new SessionCache();
    await cache.ensureSeededSession(CHAT_ID, seed);
    const cleared = await cache.ensureSeededSession(CHAT_ID, []);
    expect(cleared.sessionId).toBeNull();
    expect(cleared.disposition).toBe("cleared");
    expect(cache.resolveResumeId(CHAT_ID)).toBeUndefined();
  });

  test("a diverged transcript ALREADY under the salt-0 id walks to a salted fresh session (`seeded`)", async () => {
    const cache = new SessionCache();
    // Poison the salt-0 deterministic id with a transcript that does NOT match the seed.
    const salt0 = seedSessionId(CHAT_ID, seed, 0);
    await cache.store.append({ projectKey: "x", sessionId: salt0 }, [
      {
        type: "user",
        uuid: "poison",
        message: { role: "user", content: "something else entirely" },
      },
    ]);
    const decision = await cache.ensureSeededSession(CHAT_ID, seed);
    expect(decision.sessionId).not.toBeNull();
    expect(decision.sessionId).not.toBe(salt0);
    expect(decision.sessionId).toBe(seedSessionId(CHAT_ID, seed, 1));
    expect(decision.disposition).toBe("seeded");
  });

  test("re-adopting a previously-seeded matching salt-1 session reports `readopted`", async () => {
    const cache = new SessionCache();
    // salt-0 is poisoned (diverged); salt-1 already holds the EXACT seed (a prior seed for this state).
    const salt0 = seedSessionId(CHAT_ID, seed, 0);
    await cache.store.append({ projectKey: "x", sessionId: salt0 }, [
      { type: "user", uuid: "poison", message: { role: "user", content: "not the seed" } },
    ]);
    const salt1 = seedSessionId(CHAT_ID, seed, 1);
    await cache.store.append({ projectKey: "x", sessionId: salt1 }, buildSeedFrames(seed, salt1));
    const decision = await cache.ensureSeededSession(CHAT_ID, seed);
    expect(decision.sessionId).toBe(salt1);
    expect(decision.disposition).toBe("readopted");
  });

  test("a replace-INCAPABLE store past the salt ceiling returns null + `fresh`", async () => {
    const inner = new InMemorySessionStore();
    const appendOnly = {
      append: (k: Key, e: Entry[]): Promise<void> => inner.append(k, e),
      load: (k: Key): Promise<Entry[] | null> => inner.load(k),
    };
    const cache = new SessionCache(appendOnly);
    // Poison every salt 0..3 with a NON-matching transcript so the walk exhausts the ceiling.
    for (let salt = 0; salt < 4; salt += 1) {
      const id = seedSessionId(CHAT_ID, seed, salt);
      // biome-ignore lint/performance/noAwaitInLoops: sequential test setup, not a hot path.
      await appendOnly.append({ projectKey: "x", sessionId: id }, [
        { type: "user", uuid: `poison-${salt}`, message: { role: "user", content: "mismatch" } },
      ]);
    }
    const decision = await cache.ensureSeededSession(CHAT_ID, seed);
    expect(decision.sessionId).toBeNull();
    expect(decision.disposition).toBe("fresh");
  });
});
