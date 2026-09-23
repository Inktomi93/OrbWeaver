// support/factories/chat — the membership-scoped `chats` row (D18: NO ownerId — a bare chat is valid
// with just its own id; authority is the host PARTICIPANT). `X` is the SELECT row. Relations are ids by
// default; roster rows are EXPLICIT opt-ins per the factory contract (`seedChat(db, { withHost: true })`
// — the exact sanctioned shape in docs/law/Spine-Testing.md §4): `withHost` seeds a user + a `role:'host'`
// human membership, `withCharacter` seeds a card + a `role:'member'` character membership. The opt-in
// ids ride back on the returned row (`hostUserId` / `characterId`) so tests can act as the host.

import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { CharacterId, ChatId, ChatParticipantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../clock.ts";
import { createSeededIds } from "../ids.ts";
import { seedCharacter } from "./character.ts";
import { seedUser } from "./user.ts";

/** The full `chats` row (derived from the live schema — the factory `X`). */
export type ChatRow = typeof chats.$inferSelect;

/** Row overrides + the explicit relation opt-ins (relations are ids by default — §4). */
export interface SeedChatOptions extends Partial<ChatRow> {
  /** Seed a host: a fresh user + a `kind:'human', role:'host'` membership (joinSeq 0). */
  readonly withHost?: boolean;
  /** Seed an AI participant: a fresh character + a `kind:'character', role:'member'` membership. */
  readonly withCharacter?: boolean;
}

/** The seeded chat row, carrying the opt-in relation ids when requested. */
export interface SeededChat extends ChatRow {
  readonly hostUserId?: UserId;
  readonly characterId?: CharacterId;
}

const ids = createSeededIds();

/** Pure builder: a fully-valid bare room row (no memberships — D18 makes that legal). */
export function makeChat(overrides: Partial<ChatRow> = {}): ChatRow {
  return {
    id: castId<ChatId>(ids.next("chat")),
    title: null,
    starred: false,
    archived: false,
    temporary: false,
    // Born CLAIMED — a factory chat stands for a room that really exists (the `_support.ts::seedChat`
    // rule): every list/stats assertion in the tree means a real chat. A HUSK is `startedAt: null`,
    // passed explicitly.
    startedAt: FROZEN_AT_MS,
    pendingHostUserId: null,
    pendingHandoffOffer: null,
    anchorPersonaId: null,
    parentChatId: null,
    forkedAt: null,
    compactSummary: null,
    compactedAtSeq: null,
    metadata: null,
    variableValues: null,
    userMacroValues: null,
    runtimeVariables: null,
    streamSeq: 0,
    standaloneVariableDeltas: null,
    importedFrom: null,
    importHash: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  };
}

/** `makeChat` then insert; `withHost`/`withCharacter` opt into roster rows (see the header). */
export async function seedChat(db: Db, overrides: SeedChatOptions = {}): Promise<SeededChat> {
  const { withHost, withCharacter, ...rowOverrides } = overrides;
  const row = makeChat(rowOverrides);
  await db.insert(chats).values(row);

  let hostUserId: UserId | undefined;
  if (withHost === true) {
    const host = await seedUser(db);
    hostUserId = host.id;
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>(ids.next("chat_participant")),
      chatId: row.id,
      kind: "human",
      userId: host.id,
      role: "host",
      joinedAt: FROZEN_AT_MS,
      joinSeq: 0,
    });
  }

  let characterId: CharacterId | undefined;
  if (withCharacter === true) {
    const character = await seedCharacter(db);
    characterId = character.id;
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>(ids.next("chat_participant")),
      chatId: row.id,
      kind: "character",
      characterId: character.id,
      role: "member",
      joinedAt: FROZEN_AT_MS,
      joinSeq: 0,
    });
  }

  return {
    ...row,
    ...(hostUserId !== undefined ? { hostUserId } : {}),
    ...(characterId !== undefined ? { characterId } : {}),
  };
}
