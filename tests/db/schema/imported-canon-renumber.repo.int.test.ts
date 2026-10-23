// @subject packages/db/src/migrations/0005_renumber-imported-canon.sql
// A launched room numbered from seq 0 moves to seq 1 with every plane that names its message seqs.
import { BUILT_IN_EMBED_DIMS } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { assertReferentialIntegrity, chatParticipants, chats, closeDb, createDb, messages, runMigrations } from "@orb/db";
import type { ChatId, IdSource, UserId } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds, FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { migrationsBefore, SHIPPED_MIGRATIONS, seedChat, seedMessage, seedUser } from "@orb/testkit/node/composed";
import { asc, eq, sql } from "drizzle-orm";

const MIGRATION = "0005_renumber-imported-canon";
const IMPORTED_AT = FROZEN_AT_MS;
const BEFORE_IMPORT = IMPORTED_AT - 60_000;
const AFTER_IMPORT = IMPORTED_AT + 60_000;
const ZERO_VECTOR = JSON.stringify(Array.from({ length: BUILT_IN_EMBED_DIMS }, () => 0));

interface Room {
  readonly chatId: ChatId;
  readonly hostUserId: UserId;
  readonly ruleId: string;
}

/** One room with a row in every seq-keyed plane, numbered from `first`. */
async function seedRoom(
  db: Db,
  ids: IdSource,
  args: { readonly first: number; readonly importedFrom: string; readonly updatedAt: number; readonly compactedAtSeq: number | null; readonly settled: number },
): Promise<Room> {
  const { first } = args;
  const chat = await seedChat(
    db,
    {
      withHost: true,
      withCharacter: true,
      importedFrom: args.importedFrom,
      startedAt: IMPORTED_AT,
      updatedAt: args.updatedAt,
      compactSummary: args.compactedAtSeq === null ? null : "The travellers met at the gate.",
      compactedAtSeq: args.compactedAtSeq,
      standaloneVariableDeltas: [
        { seq: first, delta: [{ op: "set", key: "mood", value: "calm" }] },
        { seq: first + 3, delta: [{ op: "set", key: "mood", value: "tense" }] },
      ],
    },
    ids,
  );
  const hostUserId = chat.hostUserId;
  if (hostUserId === undefined) {
    throw new Error("the seeded room has no host");
  }
  for (const offset of [0, 1, 2, 3]) {
    await seedMessage(db, { chatId: chat.id, seq: first + offset, content: `line ${offset}` }, ids);
  }
  // The character seat left after the opening row; a second human joined later and left at the tail.
  await db.update(chatParticipants).set({ leftSeq: first }).where(sql`${chatParticipants.chatId} = ${chat.id} and ${chatParticipants.kind} = 'character'`);
  const guest = await seedUser(db, {}, ids);
  await db.insert(chatParticipants).values({
    id: ids.typeId(ID_PREFIX.chatParticipant),
    chatId: chat.id,
    kind: "human",
    userId: guest.id,
    role: "member",
    joinedAt: FROZEN_AT_MS,
    joinSeq: first + 2,
    leftSeq: first + 3,
  });
  const generationId = `generation-${chat.id}`;
  await db.run(sql`insert into embed_generations (id, owner_id, task, via, connection_ref, fingerprint, space)
    values (${generationId}, ${hostUserId}, 'embed', 'embed', 'connection', 'fingerprint', 'space')`);
  await db.run(sql`insert into chat_segments (id, chat_id, block_idx, chunk_idx, seq_start, seq_end, text, embedding, content_hash, model, generation_id, dim)
    values (${ids.typeId(ID_PREFIX.chatSegment)}, ${chat.id}, 0, 0, ${first}, ${first + 1}, 'segment', vector32(${ZERO_VECTOR}), 'hash', 'model', ${generationId}, ${BUILT_IN_EMBED_DIMS})`);
  const view = JSON.stringify({ type: "messageCommitted", chatId: chat.id, messageId: "message", view: { seq: first + 2 } });
  const delta = JSON.stringify({ type: "delta", chatId: chat.id, slotSeq: first + 3, delta: { kind: "text", text: "tok" } });
  const updated = JSON.stringify({ type: "chatUpdated", chatId: chat.id });
  await db.run(sql`insert into chat_events (id, chat_id, seq, type, payload) values
    (${ids.typeId(ID_PREFIX.chatEvent)}, ${chat.id}, 1, 'messageCommitted', ${view}),
    (${ids.typeId(ID_PREFIX.chatEvent)}, ${chat.id}, 2, 'delta', ${delta}),
    (${ids.typeId(ID_PREFIX.chatEvent)}, ${chat.id}, 3, 'chatUpdated', ${updated})`);
  const ruleId = ids.typeId(ID_PREFIX.automationRule);
  await db.run(sql`insert into automation_rules (id, owner_id, chat_id, name, position, trigger_bus, trigger_type, actions)
    values (${ruleId}, ${hostUserId}, ${chat.id}, 'Story analysis', 0, 'chat', 'turnCompleted', '[]')`);
  const state = JSON.stringify({ arc: "", twists: [], retiredTwists: [], settledThroughSeq: args.settled });
  await db.run(sql`insert into automation_rule_state (rule_id, state) values (${ruleId}, ${state})`);
  return { chatId: chat.id, hostUserId, ruleId };
}

/** Every stored value the migration may touch for one room, in a stable order. */
async function capture(db: Db, room: Room): Promise<Record<string, unknown>> {
  return {
    chat: await db.all(sql`select * from chats where id = ${room.chatId}`),
    messages: await db.all(sql`select * from messages where chat_id = ${room.chatId} order by id`),
    variants: await db.all(sql`select v.* from message_variants v join messages m on m.id = v.message_id where m.chat_id = ${room.chatId} order by v.id`),
    participants: await db.all(sql`select * from chat_participants where chat_id = ${room.chatId} order by id`),
    segments: await db.all(
      sql`select id, chat_id, block_idx, chunk_idx, seq_start, seq_end, text, content_hash from chat_segments where chat_id = ${room.chatId}`,
    ),
    events: await db.all(sql`select * from chat_events where chat_id = ${room.chatId} order by seq`),
    ruleState: await db.all(sql`select * from automation_rule_state where rule_id = ${room.ruleId}`),
  };
}

async function canonSeqs(db: Db, chatId: ChatId): Promise<{ id: string; seq: number }[]> {
  return await db.select({ id: messages.id, seq: messages.seq }).from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.seq));
}

async function marker(db: Db, chatId: ChatId): Promise<number | null | undefined> {
  return (await db.select({ at: chats.compactedAtSeq }).from(chats).where(eq(chats.id, chatId)))[0]?.at;
}

async function sidePlanes(db: Db, room: Room): Promise<Record<string, unknown>> {
  return {
    deltas: (await db.select({ deltas: chats.standaloneVariableDeltas }).from(chats).where(eq(chats.id, room.chatId)))[0]?.deltas?.map((d) => d.seq),
    seats: await db.all(
      sql`select kind, role, join_seq as joinSeq, left_seq as leftSeq from chat_participants where chat_id = ${room.chatId} order by kind, role`,
    ),
    segments: await db.all(sql`select seq_start as seqStart, seq_end as seqEnd from chat_segments where chat_id = ${room.chatId}`),
    events: await db.all(
      sql`select type, json_extract(payload, '$.view.seq') as viewSeq, json_extract(payload, '$.slotSeq') as slotSeq from chat_events where chat_id = ${room.chatId} order by seq`,
    ),
    settled: await db.get(sql`select json_extract(state, '$.settledThroughSeq') as settled from automation_rule_state where rule_id = ${room.ruleId}`),
  };
}

test("the migration renumbers launched 0-based rooms, keeps a carried bundle marker and leaves 1-based rooms byte for byte", async () => {
  await using previous = await migrationsBefore(MIGRATION);
  const db = await createDb(":memory:");
  try {
    await runMigrations(db, previous.path);
    const ids = createIdSource(createSeededIds().next);
    // Untouched since a bundle import: the marker names the source room's seqs.
    const bundle = await seedRoom(db, ids, { first: 0, importedFrom: "aria/room.orb.json", updatedAt: BEFORE_IMPORT, compactedAtSeq: 2, settled: 0 });
    // Written after the import: the marker may be a local pass over the 0-based rows.
    const local = await seedRoom(db, ids, { first: 0, importedFrom: "aria/room.jsonl", updatedAt: AFTER_IMPORT, compactedAtSeq: 1, settled: 2 });
    const uncompacted = await seedRoom(db, ids, { first: 0, importedFrom: "aria/other.jsonl", updatedAt: AFTER_IMPORT, compactedAtSeq: null, settled: 1 });
    const control = await seedRoom(db, ids, { first: 1, importedFrom: "aria/today.jsonl", updatedAt: BEFORE_IMPORT, compactedAtSeq: 2, settled: 2 });
    const bundleRows = await canonSeqs(db, bundle.chatId);
    const localRows = await canonSeqs(db, local.chatId);
    const controlBefore = await capture(db, control);

    await runMigrations(db, SHIPPED_MIGRATIONS);

    expect(await canonSeqs(db, bundle.chatId)).toEqual(bundleRows.map((row) => ({ ...row, seq: row.seq + 1 })));
    expect(await canonSeqs(db, local.chatId)).toEqual(localRows.map((row) => ({ ...row, seq: row.seq + 1 })));
    expect(await marker(db, bundle.chatId)).toBe(2);
    expect(await marker(db, local.chatId)).toBe(2);
    expect(await marker(db, uncompacted.chatId)).toBeNull();
    expect(await sidePlanes(db, local)).toEqual({
      deltas: [1, 4],
      seats: [
        { kind: "character", role: "member", joinSeq: 0, leftSeq: 1 },
        { kind: "human", role: "host", joinSeq: 0, leftSeq: null },
        { kind: "human", role: "member", joinSeq: 3, leftSeq: 4 },
      ],
      segments: [{ seqStart: 1, seqEnd: 2 }],
      events: [
        { type: "messageCommitted", viewSeq: 3, slotSeq: null },
        { type: "delta", viewSeq: null, slotSeq: 4 },
        { type: "chatUpdated", viewSeq: null, slotSeq: null },
      ],
      settled: { settled: 3 },
    });
    // A zero watermark means nothing is settled yet, so it stays zero.
    expect((await sidePlanes(db, bundle))["settled"]).toEqual({ settled: 0 });
    expect(await capture(db, control)).toEqual(controlBefore);
    await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  } finally {
    closeDb(db);
  }
});
