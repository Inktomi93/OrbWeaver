// substrate/backfill-estimate — the memory backfill confirm's call count, read without the planner: it equals
// the summarize calls the real sweep makes, drops to zero once the chat is built, and mints nothing.

import type { Db } from "@orb/db";
import type { CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, vi } from "vitest";
import type { ResolveBackfillMemoryConfig } from "../../../../../packages/server/src/domain/chat/contract/memory.ts";
import { backfillMemory } from "../../../../../packages/server/src/domain/chat/substrate/backfill.ts";
import { estimateMemoryBackfillCalls } from "../../../../../packages/server/src/domain/chat/substrate/backfill-estimate.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedParticipant, seedUser } from "../_support.ts";
import { fakeSummarize, realMemoryWiring, seedTurns } from "../memory/_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("estimateMemoryBackfillCalls — the confirm's count, read without the planner", () => {
  test("the estimate is the summarize calls the sweep makes, and nothing once the chat is built", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const room = await seedChat(db, "room_estimate");
    await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: room, key: "c", characterId: aria });
    await seedTurns(db, room, aria, 8);
    const summarize = fakeSummarize();
    const { ctx } = await realMemoryWiring(db, host, { summarize: summarize.op });
    // 8 aged-out turns in blocks of 2 = 4 tier-0 summaries, then 2 tier-1 consolidations of 2 children each.
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 1 });

    const before = await estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host }, cfg);
    await backfillMemory(ctx, { signal: new AbortController().signal, ownerId: host, funderUserId: host }, cfg);

    expect(before).toBe(summarize.calls.length);
    expect(before).toBe(6);
    expect(await estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host }, cfg)).toBe(0);
  });

  test("a group room counts its unminted shared bucket as unbuilt, mints nothing, and costs nothing with memory off", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const g1 = await seedCharacter(db, host, "g1");
    const g2 = await seedCharacter(db, host, "g2");
    const group = await seedChat(db, "room_estimate_group");
    await seedParticipant(db, { chatId: group, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: group, key: "c1", characterId: g1 });
    await seedParticipant(db, { chatId: group, key: "c2", characterId: g2 });
    await seedTurns(db, group, g1, 4);
    const mint = vi.fn(() => Promise.resolve({ characterId: "character_group" as CharacterId }));
    const { ctx } = await realMemoryWiring(db, host, { mintSyntheticGroupCharacter: mint, findSyntheticGroupCharacter: () => Promise.resolve(null) });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 });

    // Three buckets (the shared one + each seated character), two blocks each, no consolidation at fanOut 4.
    await expect(estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host }, cfg)).resolves.toBe(6);
    expect(mint).not.toHaveBeenCalled();
    await expect(estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host }, () => Promise.resolve({ mode: "off" }))).resolves.toBe(0);
  });
});
