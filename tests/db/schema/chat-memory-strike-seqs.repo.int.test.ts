// The strike-seq migration: a stored strike gets its endpoints' seqs from the live messages, else from the segments
// under the first-tier summary it was made on, else from its other live endpoint; a strike with none of those is
// removed. The rebuilt table, its indexes and its keys match a database that never held a strike, and a database with
// no strikes boots.
// @subject packages/db/src/migrations/0019_chat-memory-strike-seqs.sql
import { BUILT_IN_EMBED_DIMS } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { assertReferentialIntegrity, createDb, messages, runMigrations } from "@orb/db";
import type { ChatId, IdSource, MessageId } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { migrationsBefore, ownDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedCharacterRow, seedChatRow, seedMessageRow, seedUser } from "@orb/testkit/node/rows";
import type { SQL } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";

const MIGRATION = "0019_chat-memory-strike-seqs";
const ZERO_VECTOR = JSON.stringify(Array.from({ length: BUILT_IN_EMBED_DIMS }, () => 0));

type StrikeSeqs = Record<string, { readonly seqStart: number; readonly seqEnd: number }>;

async function strikeSeqs(db: Db): Promise<StrikeSeqs> {
  const rows = await db.all<{ readonly id: string; readonly seqStart: number; readonly seqEnd: number }>(
    sql`select id, seq_start as seqStart, seq_end as seqEnd from chat_memory_strikes`,
  );
  return Object.fromEntries(rows.map(({ id, seqStart, seqEnd }) => [id, { seqStart, seqEnd }]));
}

/** The table's and its indexes' stored definitions, which the migrated and the fresh database must share. */
async function strikeTableShape(db: Db): Promise<unknown> {
  return {
    master: await db.all(sql`select type, name, tbl_name, sql from sqlite_master where tbl_name = 'chat_memory_strikes' order by type, name`),
    columns: await db.all(sql`select * from pragma_table_info('chat_memory_strikes') order by cid`),
    keys: await db.all(sql`select * from pragma_foreign_key_list('chat_memory_strikes') order by id, seq`),
  };
}

/** A first-tier summary at `blockIdx` with `contentHash`, over a segment covering `seqs`. */
async function seedSummary(
  db: Db,
  ids: IdSource,
  args: {
    readonly chatId: ChatId;
    readonly ownerId: string;
    readonly characterId: string;
    readonly blockIdx: number;
    readonly seqs: readonly [number, number];
    readonly contentHash: string;
  },
): Promise<void> {
  const generationId = `generation-${args.blockIdx}`;
  await db.run(sql`insert into embed_generations (id, owner_id, task, via, connection_ref, fingerprint, space)
    values (${generationId}, ${args.ownerId}, 'embed', 'embed', 'connection', 'fingerprint', 'space')`);
  await db.run(sql`insert into chat_segments (id, chat_id, block_idx, chunk_idx, seq_start, seq_end, text, embedding, content_hash, model, generation_id, dim)
    values (${ids.typeId(ID_PREFIX.chatSegment)}, ${args.chatId}, ${args.blockIdx}, 0, ${args.seqs[0]}, ${args.seqs[1]}, 'segment', vector32(${ZERO_VECTOR}), 'segment-hash', 'model', ${generationId}, ${BUILT_IN_EMBED_DIMS})`);
  await db.run(sql`insert into chat_digests (id, chat_id, scoped_character_id, tier, block_idx, text, embedding, content_hash, model, generation_id, dim)
    values (${ids.typeId(ID_PREFIX.chatDigest)}, ${args.chatId}, ${args.characterId}, 0, ${args.blockIdx}, 'summary', vector32(${ZERO_VECTOR}), ${args.contentHash}, 'model', ${generationId}, ${BUILT_IN_EMBED_DIMS})`);
}

test("the migration gives each strike its endpoint seqs from what survives, and removes a strike nothing names", async () => {
  await using previous = await migrationsBefore(MIGRATION);
  using opened = ownDb(await createDb(":memory:"));
  const db = opened.db;
  await runMigrations(db, previous.path);
  const ids = createIdSource(createSeededIds().next);
  const owner = await seedUser(db, {}, ids);
  const keeper = await seedCharacterRow(db, { ownerId: owner.id }, ids);
  const room = await seedChatRow(db, {}, ids);
  const line = async (seq: number): Promise<MessageId> => (await seedMessageRow(db, { chatId: room.id, seq }, ids)).id;
  const at: MessageId[] = [];
  for (const seq of [1, 2, 3, 4, 5, 6, 7, 8]) {
    at[seq] = await line(seq);
  }
  const message = (seq: number): MessageId => present(at[seq]);
  const summary = { chatId: room.id, ownerId: owner.id, characterId: keeper.id } as const;
  await seedSummary(db, ids, { ...summary, blockIdx: 2, seqs: [5, 6], contentHash: "hash-of-the-summary-over-5" });
  await seedSummary(db, ids, { ...summary, blockIdx: 3, seqs: [7, 8], contentHash: "hash-of-the-summary-over-7" });
  const rows: SQL[] = [];
  const strike = (args: { readonly span: readonly [number, number]; readonly contentHash?: string; readonly tier?: number }): string => {
    const id = ids.typeId(ID_PREFIX.chatMemoryStrike);
    const contentHash = args.contentHash ?? "hash-of-no-stored-summary";
    rows.push(sql`(${id}, ${room.id}, null, ${args.tier ?? 0}, ${message(args.span[0])}, ${message(args.span[1])}, ${contentHash}, null, 1000)`);
    return id;
  };
  const live = strike({ span: [1, 2] });
  const startGone = strike({ span: [3, 4] });
  const startGoneSummary = strike({ span: [5, 6], contentHash: "hash-of-the-summary-over-5" });
  const allGoneSummary = strike({ span: [7, 8], contentHash: "hash-of-the-summary-over-7" });
  // A higher-tier strike reads no first-tier summary, so with both ends gone nothing names its span.
  const allGone = strike({ span: [7, 8], contentHash: "hash-of-the-summary-over-7", tier: 1 });
  await db.run(
    sql`insert into chat_memory_strikes (id, chat_id, scoped_character_id, tier, message_start_id, message_end_id, content_hash, topic_anchor, created_at) values ${sql.join(rows, sql`, `)}`,
  );
  for (const gone of [3, 5, 7, 8]) {
    await db.delete(messages).where(eq(messages.id, message(gone)));
  }

  await runMigrations(db, SHIPPED_MIGRATIONS);

  expect(await strikeSeqs(db)).toEqual({
    [live]: { seqStart: 1, seqEnd: 2 },
    // The other live endpoint is the best evidence left: a one-message span on the surviving struck turn.
    [startGone]: { seqStart: 4, seqEnd: 4 },
    [startGoneSummary]: { seqStart: 5, seqEnd: 6 },
    [allGoneSummary]: { seqStart: 7, seqEnd: 8 },
  });
  expect(Object.keys(await strikeSeqs(db))).not.toContain(allGone);
  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();

  // The rebuilt table is the one a database that never held a strike gets.
  using fresh = ownDb(await createDb(":memory:"));
  await runMigrations(fresh.db, SHIPPED_MIGRATIONS);
  expect(await strikeTableShape(db)).toEqual(await strikeTableShape(fresh.db));
  expect(await db.all(sql`select * from pragma_foreign_key_check('chat_memory_strikes')`)).toEqual([]);
});

test("a database whose strike table is empty boots through the migration", async () => {
  await using previous = await migrationsBefore(MIGRATION);
  using opened = ownDb(await createDb(":memory:"));
  await runMigrations(opened.db, previous.path);
  await runMigrations(opened.db, SHIPPED_MIGRATIONS);
  expect(await strikeSeqs(opened.db)).toEqual({});
  await expect(assertReferentialIntegrity(opened.db)).resolves.toBeUndefined();
});
