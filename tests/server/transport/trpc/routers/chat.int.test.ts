// The chat router's DB-backed cases — the verbs whose correctness is only visible against a REAL libSQL db
// (the roster read-model's leftSeq stamping), driven through the real middleware ladder via `createCaller`.
//
// THE ROOM STREAM'S DB CASES MOVED WITH ITS GENERATOR (SSE-1 S2): the durable head-delta replay pin and the
// D16 live clamp over real `chat_participants` rows now live at
// `tests/server/transport/trpc/stream/sources/chat.int.test.ts`.

import type { CharacterCard } from "@orb/contracts/character";
import type { Db } from "@orb/db";
import { characters, chatParticipants } from "@orb/db";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { loadParticipants } from "../../../../../packages/server/src/domain/chat/persistence/participants-read.ts";
import { createParticipants } from "../../../../../packages/server/src/domain/chat/verbs/participants.ts";
import { createRead } from "../../../../../packages/server/src/domain/chat/verbs/read.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, makeLoadParticipantViews, seedCharacter, seedChat, seedParticipant, seedUser } from "../../../domain/chat/_support.ts";
import { caller, principal as callerPrincipal, makeContext } from "../_support.ts";

/** Owner-scoped `getCard` fake mirroring the real one (D28) — `addCharacterToChat` resolves the card only
 *  for its OWNER (a foreign character reads as missing, leak-free). */
function ownedCard(rosterDb: Db): (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null> {
  return async ({ ownerId, characterId }) => {
    const [row] = await rosterDb.select().from(characters).where(eq(characters.id, characterId));
    // `greetings` is carried because it is ALWAYS present on a real card (`greetingsColumnSchema` catches to
    // `[]`) and `addCharacterToChat` reads `greetings[0]` for the F6 in-window join greeting; `[]` here means
    // "this card has no greeting to seed", which is what these two removal tests want.
    // @orb-waive no-test-fabrication(unknown): minimal CharacterCard double — the roster read needs name + avatarAssetId + greetings. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    return row !== undefined && row.ownerId === ownerId ? ({ name: row.name, avatarAssetId: null, greetings: [] } as unknown as CharacterCard) : null;
  };
}

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("chat.getChatLineage — the fork ancestry through the real router, gated per ancestor (D27)", () => {
  /** The read slice behind the procedure. Lineage summaries read only the roster; every other dep refuses,
   *  so a lineage read that reached for a connection or an assemble input would red here. */
  function lineageRead(): ReturnType<typeof createRead>["getChatLineage"] {
    const unused = (): Promise<never> => Promise.reject(new Error("unused: lineage summaries read only the roster"));
    return createRead(makeChatContext(db), {
      loadParticipantViews: makeLoadParticipantViews(db),
      resolveConnection: unused,
      checkSendAvailability: unused,
      getNextTurnConnection: unused,
      resolveForeignInputs: unused,
    }).getChatLineage;
  }

  test("a member of both chats sees the parent; a fork-only member's chain omits it; a stranger is NOT_FOUND", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const forkGuest = await seedUser(db, castId<Handle>("fork-guest"));
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const parent: ChatId = await seedChat(db, "parent", { id: mintTypeId(ID_PREFIX.chat) });
    const fork: ChatId = await seedChat(db, "fork", { id: mintTypeId(ID_PREFIX.chat), parentChatId: parent });
    await seedParticipant(db, { chatId: parent, key: "parent_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: fork, key: "fork_h", userId: host, role: "host" });
    // Invited into the fork only: a fork grants no membership of its parent.
    await seedParticipant(db, { chatId: fork, key: "fork_g", userId: forkGuest, role: "member" });

    const getChatLineage = lineageRead();
    const as = (userId: UserId): ReturnType<typeof caller> =>
      caller(makeContext({ auth: callerPrincipal("user", { userId }), services: { chat: { getChatLineage } } }));

    expect((await as(host).chat.getChatLineage({ chatId: fork })).chain.map((c) => c.id)).toEqual([parent, fork]);
    expect((await as(forkGuest).chat.getChatLineage({ chatId: fork })).chain.map((c) => c.id)).toEqual([fork]);
    await expect(as(stranger).chat.getChatLineage({ chatId: fork })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.removeCharacterFromChat — the symmetric drop, driven through the real router + roster service", () => {
  test("the host removes a present character seat — leftSeq-stamped out of the roster read-model", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, host, "aria", { id: mintTypeId(ID_PREFIX.character) });
    const chatId: ChatId = await seedChat(db, "room", { id: mintTypeId(ID_PREFIX.chat) });
    await seedParticipant(db, { chatId, key: "room_h", userId: host, role: "host" });

    const participantId = mintTypeId(ID_PREFIX.chatParticipant);
    const roster = createParticipants(makeChatContext(db, { getCard: ownedCard(db), newParticipantId: () => participantId }), {
      claimChat: (): Promise<void> => Promise.resolve(),
      emit: () => Promise.resolve(),
    });
    const hostCtx = makeContext({
      auth: callerPrincipal("user", { userId: host }),
      services: { chat: { addCharacterToChat: roster.addCharacterToChat, removeCharacterFromChat: roster.removeCharacterFromChat } },
    });

    await caller(hostCtx).chat.addCharacterToChat({ chatId, characterId });
    // Present roster (leftSeq IS NULL) carries the seat.
    expect((await loadParticipants(db, chatId)).some((p) => p.characterId === characterId)).toBe(true);

    await caller(hostCtx).chat.removeCharacterFromChat({ chatId, characterId });

    // Gone from the present read-model; the row survives leftSeq-stamped (reversible via a re-add).
    expect((await loadParticipants(db, chatId)).some((p) => p.characterId === characterId)).toBe(false);
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(row?.leftSeq).not.toBeNull();
  });

  test("a plain member caller is rejected — the seat stays present, unstamped", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const characterId = await seedCharacter(db, host, "aria", { id: mintTypeId(ID_PREFIX.character) });
    const chatId: ChatId = await seedChat(db, "room", { id: mintTypeId(ID_PREFIX.chat) });
    await seedParticipant(db, { chatId, key: "room_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "room_m", userId: member, role: "member" });

    const participantId = mintTypeId(ID_PREFIX.chatParticipant);
    const roster = createParticipants(makeChatContext(db, { getCard: ownedCard(db), newParticipantId: () => participantId }), {
      claimChat: (): Promise<void> => Promise.resolve(),
      emit: () => Promise.resolve(),
    });
    const hostCtx = makeContext({
      auth: callerPrincipal("user", { userId: host }),
      services: { chat: { addCharacterToChat: roster.addCharacterToChat, removeCharacterFromChat: roster.removeCharacterFromChat } },
    });
    const memberCtx = makeContext({
      auth: callerPrincipal("user", { userId: member }),
      services: { chat: { removeCharacterFromChat: roster.removeCharacterFromChat } },
    });

    await caller(hostCtx).chat.addCharacterToChat({ chatId, characterId });

    await expect(caller(memberCtx).chat.removeCharacterFromChat({ chatId, characterId })).rejects.toThrow();

    // The refusal was total: the seat is still present and unstamped.
    expect((await loadParticipants(db, chatId)).some((p) => p.characterId === characterId)).toBe(true);
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(row?.leftSeq).toBeNull();
  });
});
