// domain/chat/persistence/roster — the roster READ (present-by-default vs includePast, join order) + the
// PURE initial-row builder (host='host', characters server-forced 'member', shared joinSeq). Membership-
// scoped (D18); no `users` join (the no-direct-users-read chokepoint — raw rows out).

import type { Db } from "@orb/db";
import type { CharacterId, ChatId, ChatParticipantId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { buildInitialParticipantRows, loadParticipants } from "../../../../../packages/server/src/domain/chat/persistence/participants-read.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, seedChat, seedParticipant, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("loadParticipants", () => {
  test("default = PRESENT members only (leftSeq IS NULL), in join order", async () => {
    const chatId = await seedChat(db, "r1");
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host", joinSeq: 0 });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member", joinSeq: 1 });
    const gone = await seedUser(db, castId<Handle>("gone"));
    await seedParticipant(db, {
      chatId,
      key: "g",
      userId: gone,
      role: "member",
      joinSeq: 2,
      leftSeq: 9,
    });

    const present = await loadParticipants(db, chatId);
    expect(present.map((p) => p.id)).toEqual([castId<ChatParticipantId>("chat_participant_h"), castId<ChatParticipantId>("chat_participant_m")]);
  });

  test("includePast returns the full history (departed rows) for host audit / visibility", async () => {
    const chatId = await seedChat(db, "r2");
    const host = await seedUser(db, castId<Handle>("host2"));
    const gone = await seedUser(db, castId<Handle>("gone2"));
    await seedParticipant(db, { chatId, key: "h2", userId: host, role: "host", joinSeq: 0 });
    await seedParticipant(db, {
      chatId,
      key: "g2",
      userId: gone,
      role: "member",
      joinSeq: 1,
      leftSeq: 4,
    });

    expect((await loadParticipants(db, chatId, true)).length).toBe(2);
    expect((await loadParticipants(db, chatId)).length).toBe(1);
  });
});

describe("buildInitialParticipantRows (pure)", () => {
  test("host is role='host' human; characters are server-forced role='member'; host first; shared joinSeq", () => {
    const chatId = castId<ChatId>("chat_init");
    const rows = buildInitialParticipantRows({
      chatId,
      joinSeq: 0,
      now: FROZEN_AT,
      host: {
        participantId: castId<ChatParticipantId>("cp_host"),
        userId: castId<UserId>("user_host"),
      },
      characters: [
        {
          participantId: castId<ChatParticipantId>("cp_c1"),
          characterId: castId<CharacterId>("char_1"),
        },
        {
          participantId: castId<ChatParticipantId>("cp_c2"),
          characterId: castId<CharacterId>("char_2"),
        },
      ],
    });

    expect(rows[0]).toMatchObject({
      kind: "human",
      role: "host",
      userId: castId<UserId>("user_host"),
    });
    expect(rows.slice(1)).toEqual([
      expect.objectContaining({
        kind: "character",
        role: "member",
        characterId: castId<CharacterId>("char_1"),
      }),
      expect.objectContaining({
        kind: "character",
        role: "member",
        characterId: castId<CharacterId>("char_2"),
      }),
    ]);
    expect(rows.every((r) => r.joinSeq === 0 && r.joinedAt === FROZEN_AT)).toBe(true);
  });
});
