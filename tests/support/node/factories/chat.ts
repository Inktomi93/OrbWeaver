// support/factories/chat — the membership-scoped `chats` row (D18: NO ownerId — a bare chat is valid
// with just its own id; authority is the host PARTICIPANT). `X` is the SELECT row. Relations are ids by
// default; roster rows are EXPLICIT opt-ins per the factory contract (`seedChat(db, { withHost: true })`
// — the exact sanctioned shape in docs/law/Spine-Testing.md §4): `withHost` seeds a user + a `role:'host'`
// human membership, `withCharacter` seeds a card + a `role:'member'` character membership. The opt-in
// ids ride back on the returned row (`hostUserId` / `characterId`) so tests can act as the host.

import type { PortableEntity } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import {
  characters,
  chatEvents,
  chatGenerationObservations,
  chatHandoffResumptions,
  chatImportClaims,
  chatInjections,
  chatInvites,
  chatLocks,
  chatParticipants,
  chatStreamEvents,
  chats,
  compactionSpend,
  messageAssets,
  messageReactions,
  messages,
  pendingTurns,
} from "@orb/db";
import type { CharacterId, ChatId, IdSource, UserId } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { ServerProducerRoot } from "../server.ts";
import { seedCharacter } from "./character.ts";
import { seedUser } from "./user.ts";

/** The full `chats` row (derived from the live schema — the factory `X`). */
export type ChatRow = typeof chats.$inferSelect;
export type ChatInviteRow = typeof chatInvites.$inferSelect;
export type ChatParticipantRow = typeof chatParticipants.$inferSelect;
export type MessageReactionRow = typeof messageReactions.$inferSelect;
export type ChatImportClaimRow = typeof chatImportClaims.$inferSelect;
export type ChatInjectionRow = typeof chatInjections.$inferSelect;
export type MessageAssetRow = typeof messageAssets.$inferSelect;
export type ChatEventRow = typeof chatEvents.$inferSelect;
export type ChatStreamEventRow = typeof chatStreamEvents.$inferSelect;
export type ChatLockRow = typeof chatLocks.$inferSelect;
export type PendingTurnRow = typeof pendingTurns.$inferSelect;
export type ChatGenerationObservationRow = typeof chatGenerationObservations.$inferSelect;
export type CompactionSpendRow = typeof compactionSpend.$inferSelect;
export type ChatHandoffResumptionRow = typeof chatHandoffResumptions.$inferSelect;

/** The swap's durable marker is ephemeral; retain its opaque owner-parsed payload without a second parser. */
export async function captureChatHandoffResumption(db: Db, chatId: ChatId): Promise<ChatHandoffResumptionRow | undefined> {
  return await db.select().from(chatHandoffResumptions).where(eq(chatHandoffResumptions.chatId, chatId)).get();
}

/** Compaction money is owner-grained and outlives rooms; capture the owner's ledger, not a guessed per-chat row. */
export async function captureCompactionSpend(db: Db, ownerId: UserId): Promise<readonly CompactionSpendRow[]> {
  return await db.select().from(compactionSpend).where(eq(compactionSpend.ownerId, ownerId)).orderBy(compactionSpend.createdAt, compactionSpend.id);
}

/** Retained completed results are read by their real chat parent; successful canon transfer may leave none. */
export async function captureChatGenerationObservations(db: Db, chatId: ChatId): Promise<readonly ChatGenerationObservationRow[]> {
  return await db
    .select()
    .from(chatGenerationObservations)
    .where(eq(chatGenerationObservations.chatId, chatId))
    .orderBy(chatGenerationObservations.turnId, chatGenerationObservations.ordinal);
}

export interface CapturedChatReplayRows {
  readonly events: readonly ChatEventRow[];
  readonly stream: readonly ChatStreamEventRow[];
  readonly locks: readonly ChatLockRow[];
  readonly pending: readonly PendingTurnRow[];
}

/** Observe actual publication and in-flight lock state; only the real turn owns append, commit and release policy. */
export async function captureChatReplayRows(db: Db, chatId: ChatId): Promise<CapturedChatReplayRows> {
  const [events, stream, locks, pending] = await Promise.all([
    db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId)).orderBy(chatEvents.seq),
    db.select().from(chatStreamEvents).where(eq(chatStreamEvents.chatId, chatId)).orderBy(chatStreamEvents.seq),
    db.select().from(chatLocks).where(eq(chatLocks.chatId, chatId)),
    db.select().from(pendingTurns).where(eq(pendingTurns.chatId, chatId)).orderBy(pendingTurns.createdAt, pendingTurns.id),
  ]);
  return { events, stream, locks, pending };
}

export interface SeededImportedChatRows {
  readonly outcome: Awaited<ReturnType<PortableEntity["importFile"]>>;
  readonly claims: readonly ChatImportClaimRow[];
  readonly injections: readonly ChatInjectionRow[];
  readonly attachments: readonly MessageAssetRow[];
}

/** Capture newly written conversations by returned IDs; refusal and dedup do not invent a new room identity. */
export async function seedImportedChatRows(root: ServerProducerRoot, params: Parameters<PortableEntity["importFile"]>): Promise<SeededImportedChatRows> {
  const db = root.db;
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("production composition has no chat portability descriptor");
  }
  const importFile = descriptor.importFile;
  const [ownerId, file] = params;
  const outcome = await importFile(ownerId, file);
  const chatIds = outcome.memoryChatIds ?? [];
  if (!outcome.ok || chatIds.length === 0) {
    return { outcome, claims: [], injections: [], attachments: [] };
  }
  const claimed = await db
    .select({ row: chatImportClaims })
    .from(chatImportClaims)
    .innerJoin(characters, eq(characters.id, chatImportClaims.characterId))
    .where(and(eq(characters.ownerId, ownerId), inArray(chatImportClaims.chatId, [...chatIds])))
    .orderBy(chatImportClaims.chatId, chatImportClaims.characterId);
  const claims = claimed.map(({ row }) => row);
  if (chatIds.some((chatId) => !claims.some((claim) => claim.chatId === chatId))) {
    throw new Error("production conversation import left no owned claim for a returned chat");
  }
  const [injections, attachments] = await Promise.all([
    db
      .select()
      .from(chatInjections)
      .where(inArray(chatInjections.chatId, [...chatIds]))
      .orderBy(chatInjections.chatId, chatInjections.id),
    db
      .select({ row: messageAssets })
      .from(messageAssets)
      .innerJoin(messages, eq(messages.id, messageAssets.messageId))
      .where(inArray(messages.chatId, [...chatIds]))
      .orderBy(messageAssets.messageId, messageAssets.id),
  ]);
  return { outcome, claims, injections, attachments: attachments.map(({ row }) => row) };
}

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

const ids = createIdSource(createSeededIds().next);

/** Pure builder: a fully-valid bare room row (no memberships — D18 makes that legal). */
export function makeChat(overrides: Partial<ChatRow> = {}, source: IdSource = ids): ChatRow {
  return {
    id: source.typeId(ID_PREFIX.chat),
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
export async function seedChat(db: Db, overrides: SeedChatOptions = {}, source?: IdSource): Promise<SeededChat> {
  const { withHost, withCharacter, ...rowOverrides } = overrides;
  const sequence = source ?? ids;
  const row = makeChat(rowOverrides, sequence);
  await db.insert(chats).values(row);

  let hostUserId: UserId | undefined;
  if (withHost === true) {
    const host = await seedUser(db, {}, source);
    hostUserId = host.id;
    await db.insert(chatParticipants).values({
      id: sequence.typeId(ID_PREFIX.chatParticipant),
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
    const character = await seedCharacter(db, {}, source);
    characterId = character.id;
    await db.insert(chatParticipants).values({
      id: sequence.typeId(ID_PREFIX.chatParticipant),
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

/** The real host-gated mint owns CSPRNG token hashing, target resolution, bounds and notification delivery. */
export async function seedChatInvite(root: ServerProducerRoot, params: Parameters<ChatService["createInvite"]>[0]): Promise<ChatInviteRow> {
  const db = root.db;
  const createInvite = root.services.chat.createInvite;
  const result = await createInvite(params);
  const row = await db.select().from(chatInvites).where(eq(chatInvites.id, result.invite.id)).get();
  if (row === undefined) {
    throw new Error("production invite mint left no canonical chat-invite row");
  }
  return row;
}

/** Captures a real targeted join/recovery after the atomic claim, persona resolution and history-floor write. */
export async function seedInvitedChatParticipant(root: ServerProducerRoot, params: Parameters<ChatService["acceptInvite"]>[0]): Promise<ChatParticipantRow> {
  const db = root.db;
  const acceptInvite = root.services.chat.acceptInvite;
  const result = await acceptInvite(params);
  const row = await db.select().from(chatParticipants).where(eq(chatParticipants.id, result.participant.id)).get();
  if (row === undefined) {
    throw new Error("production targeted invite acceptance left no canonical participant row");
  }
  return row;
}

/** Requires a fresh target; production owns the seat, posture, floor and stored segment anchor. */
export async function seedMessageReaction(
  root: ServerProducerRoot,
  params: Parameters<ChatService["toggleReaction"]>[0],
  reactorParticipantId: MessageReactionRow["reactorParticipantId"],
): Promise<MessageReactionRow> {
  const db = root.db;
  const toggleReaction = root.services.chat.toggleReaction;
  if (!(await toggleReaction(params))) {
    throw new Error("production reaction toggle did not add a canonical reaction row");
  }
  const row = await db
    .select()
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.variantId, params.variantId),
        eq(messageReactions.reactorParticipantId, reactorParticipantId),
        eq(messageReactions.emoji, params.emoji),
        params.segmentIndex === undefined ? isNull(messageReactions.segmentIndex) : eq(messageReactions.segmentIndex, params.segmentIndex),
      ),
    )
    .get();
  if (row === undefined) {
    throw new Error("production reaction toggle left no canonical row for the supplied reactor and target");
  }
  return row;
}
