// The forward migration flags every room another human has held a seat in, departed or not, and every room copied
// from one at any depth; a solo room, a character seat and a fork of a solo room stay unflagged.
// Dev data is disposable and no other install exists, so a room whose member row an account delete already erased is accepted as unflagged.
// @subject packages/db/src/schema/chat.ts
import { createDb, runMigrations } from "@orb/db";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { migrationsBefore, ownDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedCharacterRow, seedUser } from "@orb/testkit/node/rows";
import { sql } from "drizzle-orm";

const MIGRATION = "0018_chat-ever-shared";

test("the forward migration flags rooms with a member seat and their forks, and nothing else", async () => {
  await using previous = await migrationsBefore(MIGRATION);
  using opened = ownDb(await createDb(":memory:"));
  const db = opened.db;
  await runMigrations(db, previous.path);
  const ids = createIdSource(createSeededIds().next);
  const host = await seedUser(db, {}, ids);
  const member = await seedUser(db, {}, ids);
  const character = await seedCharacterRow(db, { ownerId: host.id }, ids);
  const room = (): string => ids.typeId(ID_PREFIX.chat);
  const seat = (): string => ids.typeId(ID_PREFIX.chatParticipant);
  const [solo, soloFork, departed, fork, grandFork] = [room(), room(), room(), room(), room()];
  await db.run(sql`insert into chats (id, parent_chat_id) values
    (${solo}, null), (${soloFork}, ${solo}), (${departed}, null), (${fork}, ${departed}), (${grandFork}, ${fork})`);
  await db.run(sql`insert into chat_participants (id, chat_id, kind, user_id, character_id, role, join_seq, left_seq) values
    (${seat()}, ${solo}, 'human', ${host.id}, null, 'host', 0, null),
    (${seat()}, ${solo}, 'character', null, ${character.id}, 'member', 0, null),
    (${seat()}, ${departed}, 'human', ${host.id}, null, 'host', 0, null),
    (${seat()}, ${departed}, 'human', ${member.id}, null, 'member', 1, 3),
    (${seat()}, ${fork}, 'human', ${host.id}, null, 'host', 0, null),
    (${seat()}, ${grandFork}, 'human', ${host.id}, null, 'host', 0, null)`);

  await runMigrations(db, SHIPPED_MIGRATIONS);

  const rows = await db.all<{ readonly id: string; readonly everShared: number }>(sql`select id, ever_shared as everShared from chats`);
  expect(Object.fromEntries(rows.map(({ id, everShared }) => [id, everShared]))).toEqual({
    [solo]: 0,
    [soloFork]: 0,
    [departed]: 1,
    [fork]: 1,
    [grandFork]: 1,
  });
});
