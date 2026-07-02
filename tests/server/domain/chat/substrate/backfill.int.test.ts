// substrate/backfill — the PD-41 corpus sweeps. Pins the ENUMERATION (the sweep's own job — the per-chat
// build logic is pinned by the memory build suites): segments visit every chat; digest buckets mirror the
// engine's post-turn scopes (`__group__` bucket ONLY for >1-character rooms, then every cast character);
// the group-character sweep mints ONLY for group rooms lacking one (idempotent, host-owned); the signal
// aborts cooperatively (an aborted sweep does zero work).

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { beforeEach, describe, vi } from "vitest";
import {
  backfillGroupCharacters,
  backfillMemory,
} from "../../../../../packages/server/src/domain/chat/substrate/backfill.ts";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser } from "../_support";

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
    const ctx = makeChatContext(db);

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal });

    // 3 chats swept for segments (solo + group + empty).
    expect(counts.segments).toEqual({ scanned: 3, changed: 0 });
    // Digest buckets: solo → 1 (its cast char; NO group bucket at cast=1); group → 3 (__group__ + 2 cast);
    // empty → 0 (no cast, no buckets). Zero writes (no canon past the window).
    expect(counts.digests).toEqual({ scanned: 4, changed: 0 });
  });

  test("an already-aborted signal does zero work (cooperative abort)", async () => {
    const host = await seedUser(db, "host");
    await seedRooms(host);
    const ctx = makeChatContext(db);
    const ac = new AbortController();
    ac.abort();

    const counts = await backfillMemory(ctx, { signal: ac.signal });
    expect(counts).toEqual({
      segments: { scanned: 0, changed: 0 },
      digests: { scanned: 0, changed: 0 },
    });
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
