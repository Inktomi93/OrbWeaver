// Chat rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import type { PortableEntity, PortableFile } from "@orb/contracts/portability";
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
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { sha256Hex } from "@orb/server/primitives/content-hash";
import { buildChatBundleFile, CHAT_BUNDLE_EXT } from "@orb/server/primitives/serde/chat-bundle";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../../iso/clock.ts";
import type { ServerProducerRoot } from "../../server.ts";
import type {
  CapturedChatReplayRows,
  ChatGenerationObservationRow,
  ChatHandoffResumptionRow,
  ChatInviteRow,
  ChatParticipantRow,
  ChatRow,
  CompactionSpendRow,
  MessageReactionRow,
  SeededImportedChatRows,
  SeedTranscriptParams,
} from "../chat.ts";
import { transcriptMessage } from "../chat.ts";
import type { CapturedTurnRows } from "./message.ts";
import { captureChatCanonRows } from "./message.ts";

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

async function captureRoom(db: Db, chatId: ChatId): Promise<Omit<SeededChatRows, "view">> {
  const [row, participants] = await Promise.all([
    db.select().from(chats).where(eq(chats.id, chatId)).get(),
    db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId)).orderBy(chatParticipants.joinSeq, chatParticipants.id),
  ]);
  if (row === undefined) {
    throw new Error("production chat creation left no canonical room row");
  }
  return { row, participants };
}

/** Requires a fresh target; production owns the seat, posture, floor and stored segment anchor. */
export async function seedMessageReactionRows(
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

export interface SeededChatRows {
  readonly view: Awaited<ReturnType<ChatService["startChat"]>>;
  readonly row: ChatRow;
  readonly participants: readonly ChatParticipantRow[];
}

export interface SeededTranscriptRows extends Omit<SeededChatRows, "view"> {
  readonly messages: CapturedTurnRows;
}

/** The caller becomes host and the founding characters join; production owns the husk, roster and opening. */
export async function seedChatRows(root: ServerProducerRoot, params: Parameters<ChatService["startChat"]>[0]): Promise<SeededChatRows> {
  const startChat = root.services.chat.startChat;
  const view = await startChat(params);
  return { view, ...(await captureRoom(root.db, view.chat.id)) };
}

/** The real host-gated mint owns CSPRNG token hashing, target resolution, bounds and notification delivery. */
export async function seedChatInviteRows(root: ServerProducerRoot, params: Parameters<ChatService["createInvite"]>[0]): Promise<ChatInviteRow> {
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
export async function seedInvitedChatParticipantRows(
  root: ServerProducerRoot,
  params: Parameters<ChatService["acceptInvite"]>[0],
): Promise<ChatParticipantRow> {
  const db = root.db;
  const acceptInvite = root.services.chat.acceptInvite;
  const result = await acceptInvite(params);
  const row = await db.select().from(chatParticipants).where(eq(chatParticipants.id, result.participant.id)).get();
  if (row === undefined) {
    throw new Error("production targeted invite acceptance left no canonical participant row");
  }
  return row;
}

/** A history with assistant rows is bulk data: the native chat import writes it in one call, with no turn. */
export async function seedTranscriptRows(root: ServerProducerRoot, params: SeedTranscriptParams): Promise<SeededTranscriptRows> {
  const db = root.db;
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("production composition has no chat portability descriptor");
  }
  const importFile = descriptor.importFile;
  const [primary] = params.characterHandles;
  if (primary === undefined) {
    throw new Error("a transcript import needs a seated character; production refuses a characterless room");
  }
  const bytes = buildChatBundleFile({
    title: params.chat?.title ?? "",
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    starred: false,
    archived: false,
    compactSummary: null,
    compactedAtSeq: null,
    metadata: params.chat?.metadata ?? null,
    variableValues: null,
    userMacroValues: null,
    anchorPersonaName: params.chat?.anchorPersonaName ?? null,
    characterHandles: params.characterHandles,
    tagNames: [],
    injections: [],
    messages: params.lines.map(transcriptMessage),
    rpg: null,
  });
  const file: PortableFile = { filename: `${primary}/transcript${CHAT_BUNDLE_EXT}`, bytes };
  const outcome = await importFile(params.ownerId, file);
  if (!(outcome.ok && outcome.created)) {
    throw new Error(`production chat import wrote no transcript: ${outcome.ok ? "an identical transcript was already imported" : outcome.error}`);
  }
  // The import's dedup key is the file hash, so it names exactly the room this call wrote.
  const imported = await db
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.importHash, sha256Hex(bytes)))
    .get();
  if (imported === undefined) {
    throw new Error("production chat import left no room under the transcript's import hash");
  }
  const [room, captured] = await Promise.all([captureRoom(db, imported.id), captureChatCanonRows(db, imported.id)]);
  return { ...room, messages: captured };
}
