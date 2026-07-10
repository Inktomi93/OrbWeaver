// substrate/backfill — the PD-41 corpus sweeps. Pins the ENUMERATION (the sweep's own job — the per-chat
// build logic is pinned by the memory build suites): segments visit every chat; digest buckets mirror the
// engine's post-turn scopes (`__group__` bucket ONLY for >1-character rooms, then every cast character);
// the group-character sweep mints ONLY for group rooms lacking one (idempotent, host-owned); the signal
// aborts cooperatively (an aborted sweep does zero work).

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { beforeEach, describe, vi } from "vitest";
import type { ResolveBackfillMemoryConfig } from "../../../../../packages/server/src/domain/chat/contract/memory.ts";
import {
  backfillGroupCharacters,
  backfillMemory,
} from "../../../../../packages/server/src/domain/chat/substrate/backfill.ts";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser } from "../_support";

/** A memory-config resolver that leaves the host's memory ENABLED (empty partial ⇒ the baked floor, `mixC`),
 *  so the sweep builds exactly as the pre-#54 baked-defaults path did (the enumeration assertions below). */
const enabledMemory: ResolveBackfillMemoryConfig = () => Promise.resolve({});

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** Seed: a solo room (1 char), a group room (2 chars), and an empty room (no cast). Tiny canon (none) —
 *  every memory build early-returns (cutoff < blockSize), so the sweep's ENUMERATION is what's observable. */
async function seedRooms(host: UserId): Promise<{ soloChar: CharacterId; groupChars: number }> {
  const soloChar = await seedCharacter(db, host, "solo_c");
  const g1 = await seedCharacter(db, host, "g1");
  const g2 = await seedCharacter(db, host, "g2");
  const solo = await seedChat(db, "solo");
  const group = await seedChat(db, "group");
  await seedChat(db, "empty");
  await seedParticipant(db, { chatId: solo, key: "s_h", userId: host, role: "host" });
  await seedParticipant(db, { chatId: solo, key: "s_c", characterId: soloChar });
  await seedParticipant(db, { chatId: group, key: "g_h", userId: host, role: "host" });
  await seedParticipant(db, { chatId: group, key: "g_c1", characterId: g1 });
  await seedParticipant(db, { chatId: group, key: "g_c2", characterId: g2 });
  return { soloChar, groupChars: 2 };
}

describe("backfillMemory — the chat × scope enumeration", () => {
  test("segments visit every chat; digest buckets mirror the engine's scopes (group bucket only >1 cast)", async () => {
    const host = await seedUser(db, "host");
    await seedRooms(host);
    // The shared group bucket is find-or-minted (the REAL synthetic-char id — inv 8), so the sweep resolves
    // it exactly the way the engine's post-turn trigger does (no fabricated `__group__` handle).
    const ctx = makeChatContext(db, {
      mintSyntheticGroupCharacter: () =>
        Promise.resolve({ characterId: "character_group" as CharacterId }),
    });

    const counts = await backfillMemory(
      ctx,
      { signal: new AbortController().signal },
      enabledMemory,
    );

    // 3 chats swept for segments (solo + group + empty).
    expect(counts.segments).toEqual({ scanned: 3, changed: 0 });
    // Digest buckets: solo → 1 (its cast char; NO group bucket at cast=1); group → 3 (synthetic group char +
    // 2 cast); empty → 0 (no cast, no buckets). Zero writes (no canon past the window).
    expect(counts.digests).toEqual({ scanned: 4, changed: 0 });
  });

  test("PER-CHAT ISOLATION: one poisoned chat does NOT kill the sweep (the rest still process)", async () => {
    const host = await seedUser(db, "host");
    // Two group rooms; the FIRST poisons its group-bucket resolve (a mint failure). Without isolation its
    // throw would abort the WHOLE PD-41 corpus sweep before the healthy room is ever reached.
    const p1 = await seedCharacter(db, host, "p1");
    const p2 = await seedCharacter(db, host, "p2");
    const h1 = await seedCharacter(db, host, "h1");
    const h2 = await seedCharacter(db, host, "h2");
    const poisoned = await seedChat(db, "poisoned");
    const healthy = await seedChat(db, "healthy");
    await seedParticipant(db, { chatId: poisoned, key: "p_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: poisoned, key: "p_c1", characterId: p1 });
    await seedParticipant(db, { chatId: poisoned, key: "p_c2", characterId: p2 });
    await seedParticipant(db, { chatId: healthy, key: "h_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: healthy, key: "h_c1", characterId: h1 });
    await seedParticipant(db, { chatId: healthy, key: "h_c2", characterId: h2 });

    const ctx = makeChatContext(db, {
      mintSyntheticGroupCharacter: ({ chatId }) =>
        chatId === poisoned
          ? Promise.reject(new Error("boom: poisoned chat"))
          : Promise.resolve({ characterId: "character_group" as CharacterId }),
    });

    // The call RESOLVES (the poisoned chat's throw was isolated, not propagated) …
    const counts = await backfillMemory(
      ctx,
      { signal: new AbortController().signal },
      enabledMemory,
    );

    // … both chats were swept for segments; only the HEALTHY room's digest buckets enumerated (synthetic +
    // 2 cast = 3) — the poisoned room contributed zero digest scans but did NOT abort the healthy one.
    expect(counts.segments.scanned).toBe(2);
    expect(counts.digests.scanned).toBe(3);
  });

  test("an already-aborted signal does zero work (cooperative abort)", async () => {
    const host = await seedUser(db, "host");
    await seedRooms(host);
    const ctx = makeChatContext(db);
    const ac = new AbortController();
    ac.abort();

    const counts = await backfillMemory(ctx, { signal: ac.signal }, enabledMemory);
    expect(counts).toEqual({
      segments: { scanned: 0, changed: 0 },
      digests: { scanned: 0, changed: 0 },
    });
  });

  test("a memory-DISABLED host's chat is SKIPPED (D36 opt-out) while an enabled host's chat still builds", async () => {
    // Two hosts, each hosting one group room. The resolver reports host_off as `mode:"off"` (memory disabled)
    // and host_on as enabled — the SAME opt-out the live turn path honors, now honored on the corpus sweep (#54).
    const hostOff = await seedUser(db, "host_off");
    const hostOn = await seedUser(db, "host_on");
    const oc1 = await seedCharacter(db, hostOff, "oc1");
    const oc2 = await seedCharacter(db, hostOff, "oc2");
    const nc1 = await seedCharacter(db, hostOn, "nc1");
    const nc2 = await seedCharacter(db, hostOn, "nc2");
    const roomOff = await seedChat(db, "room_off");
    const roomOn = await seedChat(db, "room_on");
    await seedParticipant(db, { chatId: roomOff, key: "off_h", userId: hostOff, role: "host" });
    await seedParticipant(db, { chatId: roomOff, key: "off_c1", characterId: oc1 });
    await seedParticipant(db, { chatId: roomOff, key: "off_c2", characterId: oc2 });
    await seedParticipant(db, { chatId: roomOn, key: "on_h", userId: hostOn, role: "host" });
    await seedParticipant(db, { chatId: roomOn, key: "on_c1", characterId: nc1 });
    await seedParticipant(db, { chatId: roomOn, key: "on_c2", characterId: nc2 });

    // The synthetic-group mint stands in for ALL per-scope work — a mint call proves the sweep reached the
    // disabled room's scope enumeration. It must fire ONLY for the enabled room.
    const mint = vi.fn(async (_args: { ownerId: UserId; chatId: string }) => ({
      characterId: "character_group" as CharacterId,
    }));
    const ctx = makeChatContext(db, { mintSyntheticGroupCharacter: mint as never });
    const resolve: ResolveBackfillMemoryConfig = (hostUserId) =>
      Promise.resolve(hostUserId === hostOff ? { mode: "off" } : {});

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal }, resolve);

    // The disabled host's room is skipped ENTIRELY — no segment scan, no scope enumeration, no synthetic mint.
    // Only the enabled room builds: 1 segment scan + its 3 digest buckets (synthetic group + 2 cast).
    expect(counts.segments).toEqual({ scanned: 1, changed: 0 });
    expect(counts.digests).toEqual({ scanned: 3, changed: 0 });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint.mock.calls[0]?.[0]).toMatchObject({ ownerId: hostOn, chatId: roomOn });
  });

  test("a resolver failure on one chat → warn + continue (the per-chat isolation belt covers the resolver)", async () => {
    // Two hosts, one group room each; the resolver THROWS for host_bad's settings read. Without the isolation
    // belt wrapping the resolver call, that throw would abort the whole sweep before host_good's room builds.
    const hostBad = await seedUser(db, "host_bad");
    const hostGood = await seedUser(db, "host_good");
    const bc1 = await seedCharacter(db, hostBad, "bc1");
    const bc2 = await seedCharacter(db, hostBad, "bc2");
    const gc1 = await seedCharacter(db, hostGood, "gc1");
    const gc2 = await seedCharacter(db, hostGood, "gc2");
    const roomBad = await seedChat(db, "room_bad");
    const roomGood = await seedChat(db, "room_good");
    await seedParticipant(db, { chatId: roomBad, key: "bad_h", userId: hostBad, role: "host" });
    await seedParticipant(db, { chatId: roomBad, key: "bad_c1", characterId: bc1 });
    await seedParticipant(db, { chatId: roomBad, key: "bad_c2", characterId: bc2 });
    await seedParticipant(db, { chatId: roomGood, key: "good_h", userId: hostGood, role: "host" });
    await seedParticipant(db, { chatId: roomGood, key: "good_c1", characterId: gc1 });
    await seedParticipant(db, { chatId: roomGood, key: "good_c2", characterId: gc2 });

    const ctx = makeChatContext(db, {
      mintSyntheticGroupCharacter: () =>
        Promise.resolve({ characterId: "character_group" as CharacterId }),
    });
    const resolve: ResolveBackfillMemoryConfig = (hostUserId) =>
      hostUserId === hostBad ? Promise.reject(new Error("settings boom")) : Promise.resolve({});

    // Resolves (the resolver throw was isolated), and the healthy room still built its buckets.
    const counts = await backfillMemory(ctx, { signal: new AbortController().signal }, resolve);

    expect(counts.segments.scanned).toBe(1);
    expect(counts.digests.scanned).toBe(3);
  });
});

describe("backfillGroupCharacters — mint only for group rooms lacking one", () => {
  test("a >1-character room without a group character mints ONE under the host; solo/empty skipped", async () => {
    const host = await seedUser(db, "host");
    await seedRooms(host);
    const mint = vi.fn(async (_args: { ownerId: UserId; chatId: string }) => ({
      characterId: "character_group" as CharacterId,
    }));
    const ctx = makeChatContext(db, {
      findSyntheticGroupCharacter: () => Promise.resolve(null),
      mintSyntheticGroupCharacter: mint as never,
    });

    const counts = await backfillGroupCharacters(ctx, { signal: new AbortController().signal });

    expect(counts).toEqual({ scanned: 1, changed: 1 });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint.mock.calls[0]?.[0]).toMatchObject({ ownerId: host });
  });

  test("an existing group character short-circuits (scanned, not changed) — idempotent", async () => {
    const host = await seedUser(db, "host");
    await seedRooms(host);
    const mint = vi.fn();
    const ctx = makeChatContext(db, {
      findSyntheticGroupCharacter: () =>
        Promise.resolve({ characterId: "character_group" as CharacterId }),
      mintSyntheticGroupCharacter: mint as never,
    });

    const counts = await backfillGroupCharacters(ctx, { signal: new AbortController().signal });

    expect(counts).toEqual({ scanned: 1, changed: 0 });
    expect(mint).not.toHaveBeenCalled();
  });
});
