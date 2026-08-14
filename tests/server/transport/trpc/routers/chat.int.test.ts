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
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { loadRoster } from "../../../../../packages/server/src/domain/chat/persistence/roster.ts";
import { createRoster } from "../../../../../packages/server/src/domain/chat/verbs/roster.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser } from "../../../domain/chat/_support.ts";
import { caller, principal as callerPrincipal, makeContext } from "../_support.ts";

/** Owner-scoped `getCard` fake mirroring the real one (D28) — `addCharacterToChat` resolves the card only
 *  for its OWNER (a foreign character reads as missing, leak-free). */
function ownedCard(rosterDb: Db): (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null> {
  return async ({ ownerId, characterId }) => {
    const [row] = await rosterDb.select().from(characters).where(eq(characters.id, characterId));
    // `greetings` is carried because it is ALWAYS present on a real card (`greetingsColumnSchema` catches to
    // `[]`) and `addCharacterToChat` reads `greetings[0]` for the F6 in-window join greeting; `[]` here means
    // "this card has no greeting to seed", which is what these two removal tests want.
    // FABRICATION-OK: minimal CharacterCard double — the roster read needs name + avatarAssetId + greetings.
    return row !== undefined && row.ownerId === ownerId ? ({ name: row.name, avatarAssetId: null, greetings: [] } as unknown as CharacterCard) : null;
  };
}

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("chat.removeCharacterFromChat — the symmetric drop, driven through the real router + roster service", () => {
  test("the host removes a present character seat — leftSeq-stamped out of the roster read-model", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId: ChatId = await seedChat(db, "room");
    await seedParticipant(db, { chatId, key: "room_h", userId: host, role: "host" });

    const roster = createRoster(makeChatContext(db, { getCard: ownedCard(db) }), {
      claimChat: (): Promise<void> => Promise.resolve(),
      emit: () => Promise.resolve(),
    });
    const hostCtx = makeContext({
      auth: callerPrincipal("user", { userId: host }),
      services: { chat: { addCharacterToChat: roster.addCharacterToChat, removeCharacterFromChat: roster.removeCharacterFromChat } },
    });

    await caller(hostCtx).chat.addCharacterToChat({ chatId, characterId });
    // Present roster (leftSeq IS NULL) carries the seat.
    expect((await loadRoster(db, chatId)).some((p) => p.characterId === characterId)).toBe(true);

    await caller(hostCtx).chat.removeCharacterFromChat({ chatId, characterId });

    // Gone from the present read-model; the row survives leftSeq-stamped (reversible via a re-add).
    expect((await loadRoster(db, chatId)).some((p) => p.characterId === characterId)).toBe(false);
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(row?.leftSeq).not.toBeNull();
  });

  test("a plain member caller is rejected — the seat stays present, unstamped", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId: ChatId = await seedChat(db, "room");
    await seedParticipant(db, { chatId, key: "room_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "room_m", userId: member, role: "member" });

    const roster = createRoster(makeChatContext(db, { getCard: ownedCard(db) }), {
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
    expect((await loadRoster(db, chatId)).some((p) => p.characterId === characterId)).toBe(true);
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(row?.leftSeq).toBeNull();
  });
});
