// substrate/backfill-estimate — the memory backfill confirm's call count, read without the planner: it equals
// the summarize calls the real sweep makes, drops to zero once the chat is built, mints nothing, and honours an import window.

import type { Db } from "@orb/db";
import { chatImportClaims, messages, messageVariants } from "@orb/db";
import type { CharacterId, ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import type { ResolveBackfillMemoryConfig } from "../../../../../packages/server/src/domain/chat/contract/memory.ts";
import { backfillMemory, loadAllChatIds } from "../../../../../packages/server/src/domain/chat/substrate/backfill.ts";
import { estimateMemoryBackfillCalls } from "../../../../../packages/server/src/domain/chat/substrate/backfill-estimate.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedParticipant, seedUser } from "../_support.ts";
import { fakeSummarize, realMemoryWiring, seedTurns } from "../memory/_support.ts";

const IMPORT_WINDOW = { from: 1_700_000_000_000, to: 1_700_000_060_000 };
const LARGE_IMPORT = 1200;

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

    const before = await estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, importWindow: null }, cfg);
    await backfillMemory(ctx, { signal: new AbortController().signal, ownerId: host, funderUserId: host, importWindow: null, segmentsOnly: false }, cfg);

    expect(before).toBe(summarize.calls.length);
    expect(before).toBe(6);
    expect(await estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, importWindow: null }, cfg)).toBe(0);
  });

  // A seated character's bucket holds only what it witnessed, so the count follows the planner's narrowing.
  test("a character seated mid-chat is counted only for the blocks it witnessed, as the sweep builds them", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const room = await seedChat(db, "room_estimate_late");
    await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: room, key: "c", characterId: aria, joinSeq: 5 });
    await seedTurns(db, room, aria, 8);
    const summarize = fakeSummarize();
    const { ctx } = await realMemoryWiring(db, host, { summarize: summarize.op });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 1 });

    const before = await estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, importWindow: null }, cfg);
    await backfillMemory(ctx, { signal: new AbortController().signal, ownerId: host, funderUserId: host, importWindow: null, segmentsOnly: false }, cfg);

    // Seq 5..8 are two witnessed blocks and one consolidation of them; the two blocks before the seat are never built.
    expect(before).toBe(3);
    expect(summarize.calls).toHaveLength(before);
  });

  // An edited message changes its block's hash, so the build re-summarizes that block and every parent above it.
  test("an edit to a built block is counted again, with the consolidation above it", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const room = await seedChat(db, "room_estimate_edit");
    await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: room, key: "c", characterId: aria });
    await seedTurns(db, room, aria, 8);
    const summarize = fakeSummarize();
    const { ctx } = await realMemoryWiring(db, host, { summarize: summarize.op });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 1 });
    const scope = { ownerId: host, funderUserId: host, importWindow: null };
    const sweep = { ...scope, segmentsOnly: false, signal: new AbortController().signal };
    await backfillMemory(ctx, sweep, cfg);
    expect(await estimateMemoryBackfillCalls(ctx, scope, cfg)).toBe(0);

    await db
      .update(messageVariants)
      .set({ content: "turn 1, rewritten" })
      .where(
        inArray(
          messageVariants.id,
          db
            .select({ id: messageVariants.id })
            .from(messageVariants)
            .innerJoin(messages, eq(messages.selectedVariantId, messageVariants.id))
            .where(and(eq(messages.chatId, room), eq(messages.seq, 1))),
        ),
      );
    summarize.calls.length = 0;
    const after = await estimateMemoryBackfillCalls(ctx, scope, cfg);
    await backfillMemory(ctx, sweep, cfg);

    expect(after).toBe(2);
    expect(summarize.calls).toHaveLength(after);
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
    await expect(estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, importWindow: null }, cfg)).resolves.toBe(6);
    expect(mint).not.toHaveBeenCalled();
    await expect(
      estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, importWindow: null }, () => Promise.resolve({ mode: "off" })),
    ).resolves.toBe(0);
  });

  // An import's "Build memory for imported chats" offer scopes the run to the span in which that import wrote its
  // chats: the count and the sweep cover those chats only, and another owner's import in the same span is never reached.
  test("an import-window estimate counts only the host's chats claimed in the span, and the scoped sweep builds exactly those", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const aria = await seedCharacter(db, host, "aria");
    const bryn = await seedCharacter(db, stranger, "bryn");
    const imported = await seedChat(db, "room_imported");
    const older = await seedChat(db, "room_older");
    const foreign = await seedChat(db, "room_foreign");
    for (const [room, user, character, claimedAt] of [
      [imported, host, aria, IMPORT_WINDOW.from + 10],
      [older, host, aria, IMPORT_WINDOW.from - 1],
      [foreign, stranger, bryn, IMPORT_WINDOW.to],
    ] as const) {
      await seedParticipant(db, { chatId: room, key: `${room}_h`, userId: user, role: "host" });
      await seedParticipant(db, { chatId: room, key: `${room}_c`, characterId: character });
      await seedTurns(db, room, character, 4);
      await db.insert(chatImportClaims).values({ chatId: room, characterId: character, importHash: `hash_${room}`, createdAt: claimedAt });
    }
    const summarize = fakeSummarize();
    const { ctx } = await realMemoryWiring(db, host, { summarize: summarize.op });
    // 4 aged-out turns in blocks of 2 = 2 tier-0 summaries per room, no consolidation at fanOut 4.
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 });
    const scope = { ownerId: host, funderUserId: host, importWindow: IMPORT_WINDOW };

    const scoped = await estimateMemoryBackfillCalls(ctx, scope, cfg);
    await backfillMemory(ctx, { ...scope, segmentsOnly: false, signal: new AbortController().signal }, cfg);

    expect(scoped).toBe(2);
    expect(summarize.calls).toHaveLength(scoped);
    // The scoped run built the imported room only: the host's older room, claimed before the span, is still unbuilt.
    await expect(estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, importWindow: null }, cfg)).resolves.toBe(2);
  });

  // The scope is a two-number handle and resolves through a subquery, so an import's size never reaches a URL or the
  // SQLite bound-variable limit.
  test("an import window over 1200 chats resolves every one of them", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const rooms: ChatId[] = [];
    for (let i = 0; i < LARGE_IMPORT; i += 1) {
      const room = await seedChat(db, `room_bulk_${String(i)}`);
      await seedParticipant(db, { chatId: room, key: `bulk_${String(i)}`, userId: host, role: "host" });
      rooms.push(room);
    }
    await db
      .insert(chatImportClaims)
      .values(rooms.map((chatId, i) => ({ chatId, characterId: aria, importHash: `bulk_${String(i)}`, createdAt: IMPORT_WINDOW.from })));
    const { ctx } = await realMemoryWiring(db, host);

    const inScope = await loadAllChatIds(ctx, host, IMPORT_WINDOW);

    expect(new Set(inScope)).toEqual(new Set(rooms));
  });
});
