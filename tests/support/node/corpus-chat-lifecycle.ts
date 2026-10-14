// Only production operations create canon; transient snapshots are private observations at physical holds.
import { createCharacterSchema } from "@orb/contracts/character";
import { chatInjectionInputSchema } from "@orb/contracts/chat";
import { chatImportClaims, chats, messageReactions } from "@orb/db";
import { contentSpanRaw } from "@orb/kit/content";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ChatOperationError } from "@orb/server/domain/chat";
import { eq } from "drizzle-orm";
import type { createCorpusChatWire } from "./corpus-chat-wire.ts";
import {
  CORPUS_CHAT_ABORT_CUE,
  CORPUS_CHAT_DEFERRED_CUE,
  CORPUS_CHAT_EMPTY_CUE,
  CORPUS_CHAT_HELD_CUE,
  CORPUS_CHAT_IMPORT_CUE,
  CORPUS_CHAT_MODEL,
} from "./corpus-chat-wire.ts";
import { CORPUS_PROVIDER_ENDPOINT } from "./corpus-provider.ts";
import type { DbStatementHold } from "./db.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import {
  captureChatGenerationObservations,
  captureChatHandoffResumption,
  captureChatReplayRows,
  captureCompactionSpend,
  seedChatInvite,
  seedImportedChatRows,
  seedInvitedChatParticipant,
  seedMessageReaction,
} from "./factories/chat.ts";
import type { ServerTestHarness } from "./server.ts";

type ChatWire = ReturnType<typeof createCorpusChatWire>;
type ChatService = ServerTestHarness["services"]["chat"];
type NativeTurn = Awaited<ReturnType<ChatService["send"]>>;
type NativeReplay = Awaited<ReturnType<typeof captureChatReplayRows>>;
type NativeImported = Awaited<ReturnType<typeof seedImportedChatRows>>;
interface NativeRoom {
  readonly character: Awaited<ReturnType<ServerTestHarness["services"]["character"]["create"]>>;
  readonly room: Awaited<ReturnType<ChatService["startChat"]>>;
}
interface ImportReactionCapture extends NativeRoom {
  readonly asset: Awaited<ReturnType<ServerTestHarness["app"]["assets"]["store"]>>;
  readonly injection: ReturnType<typeof chatInjectionInputSchema.parse>;
  readonly turn: NativeTurn;
  readonly imported: NativeImported;
  readonly repeated: NativeImported;
  readonly foreign: NativeImported;
  readonly beforeForeign: { readonly rooms: readonly (typeof chats.$inferSelect)[]; readonly claims: readonly (typeof chatImportClaims.$inferSelect)[] };
  readonly afterForeign: ImportReactionCapture["beforeForeign"];
  readonly whole: Awaited<ReturnType<typeof seedMessageReaction>>;
  readonly segment: Awaited<ReturnType<typeof seedMessageReaction>>;
  readonly removed: boolean;
  readonly remaining: readonly (typeof messageReactions.$inferSelect)[];
  readonly reactions: Awaited<ReturnType<ChatService["listReactions"]>>;
  readonly restored: Awaited<ReturnType<ChatService["listMessages"]>>;
}
interface CompactRefusalCapture {
  readonly compactRoom: NativeRoom;
  readonly compacted: Awaited<ReturnType<ChatService["compact"]>>;
  readonly spend: Awaited<ReturnType<typeof captureCompactionSpend>>;
  readonly repeated: CompactRefusalCapture["compacted"];
  readonly repeatedSpend: CompactRefusalCapture["spend"];
  readonly refusedRoom: NativeRoom;
  readonly refusal: string | undefined;
  readonly observations: Awaited<ReturnType<typeof captureChatGenerationObservations>>;
  readonly canon: Awaited<ReturnType<ChatService["listMessages"]>>;
}
interface HeldTurnCapture extends NativeRoom {
  readonly invite: Awaited<ReturnType<typeof seedChatInvite>>;
  readonly during: NativeReplay | undefined;
  readonly foreignRefusal: string | undefined;
  readonly turn: NativeTurn;
  readonly completed: NativeReplay;
  readonly stream: Awaited<ReturnType<ChatService["replayStreamEvents"]>>;
  readonly events: Awaited<ReturnType<ChatService["replayChatEvents"]>>;
  readonly canon: Awaited<ReturnType<ChatService["listMessages"]>>;
}
interface DeferredHandoffCapture extends NativeRoom {
  readonly invite: Awaited<ReturnType<typeof seedChatInvite>>;
  readonly participant: Awaited<ReturnType<typeof seedInvitedChatParticipant>>;
  readonly submitted: NativeTurn;
  readonly deferred: NativeReplay;
  readonly drained: Awaited<ReturnType<ChatService["drainDeferredTurns"]>>;
  readonly drainRepeated: DeferredHandoffCapture["drained"];
  readonly completed: NativeReplay;
  readonly marker: Awaited<ReturnType<typeof captureChatHandoffResumption>>;
  readonly accepted: Awaited<ReturnType<ChatService["getChat"]>> | undefined;
  readonly oldHostRefusal: string | undefined;
  readonly finalMarker: DeferredHandoffCapture["marker"];
  readonly final: Awaited<ReturnType<ChatService["getChat"]>>;
  readonly acceptedSeat: NonNullable<DeferredHandoffCapture["accepted"]>["participants"][number];
  readonly finalSeat: DeferredHandoffCapture["final"]["participants"][number];
  readonly copiedCharacter: Awaited<ReturnType<ServerTestHarness["services"]["character"]["get"]>>;
}
interface CorpusChatLifecycle {
  readonly connection: Awaited<ReturnType<ServerTestHarness["services"]["connection"]["create"]>>;
  readonly imported: ImportReactionCapture;
  readonly compacted: CompactRefusalCapture;
  readonly held: HeldTurnCapture;
  readonly aborted: HeldTurnCapture;
  readonly handoff: DeferredHandoffCapture;
}

async function lifecycleRoom(root: ServerTestHarness, handle: string): Promise<NativeRoom> {
  const caller = await root.internalCallerFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle, name: "Lifecycle witness", description: "A keeper preserves the orbital ledger." }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  return { character, room };
}

async function importAndReact(root: ServerTestHarness, foreignUserId: ServerTestHarness["ownerId"]): Promise<ImportReactionCapture> {
  const principal = await root.principalFor(root.ownerId);
  const source = await lifecycleRoom(root, "corpus-lifecycle-import");
  const chatId = source.room.chat.id;
  const injection = chatInjectionInputSchema.parse({ position: "in_chat", depth: 0, role: "system", content: "Keep the lifecycle scene factual.", order: 2 });
  await root.services.chat.setChatInjection({ principal, chatId, ...injection });
  const asset = await root.app.assets.store({ principal, kind: "attachment", mime: "image/png", bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)) });
  const content = `${CORPUS_CHAT_IMPORT_CUE} ${contentSpanRaw({ kind: "image", ref: { kind: "asset", assetId: asset.assetId }, alt: "Lifecycle ledger" })}`;
  const turn = await root.services.chat.send({ principal, chatId, content, attachmentAssetIds: [asset.assetId], timeZone: UTC_TIME_ZONE });
  const file = await root.app.exportService.exportChatBundle({ principal, chatId });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (file === null || descriptor === undefined) {
    throw new Error("native lifecycle export returned no chat bundle");
  }
  const imported = await seedImportedChatRows(root.db, descriptor.importFile, [root.ownerId, file]);
  const repeated = await seedImportedChatRows(root.db, descriptor.importFile, [root.ownerId, file]);
  const beforeForeign = {
    rooms: await root.db.select().from(chats).orderBy(chats.id),
    claims: await root.db.select().from(chatImportClaims).orderBy(chatImportClaims.chatId),
  };
  const foreign = await seedImportedChatRows(root.db, descriptor.importFile, [foreignUserId, file]);
  const afterForeign = {
    rooms: await root.db.select().from(chats).orderBy(chats.id),
    claims: await root.db.select().from(chatImportClaims).orderBy(chatImportClaims.chatId),
  };
  const importedId = imported.outcome.memoryChatIds?.[0];
  const assistant = turn.messages.find((message) => message.role === "assistant");
  const reactor = source.room.chat.participants.find((seat) => seat.userId === root.ownerId);
  if (importedId === undefined || assistant === undefined || reactor === undefined) {
    throw new Error("native lifecycle canon has no imported room, assistant or reactor");
  }
  const params = { principal, chatId, variantId: assistant.selectedVariantId, emoji: "👍" } as const;
  const whole = await seedMessageReaction(root.db, root.services.chat.toggleReaction, params, reactor.id);
  const segment = await seedMessageReaction(root.db, root.services.chat.toggleReaction, { ...params, segmentIndex: 0, segmentSpeaker: null }, reactor.id);
  const removed = await root.services.chat.toggleReaction(params);
  const reactions = await root.services.chat.listReactions({ principal, chatId });
  const remaining = await root.db
    .select()
    .from(messageReactions)
    .where(eq(messageReactions.variantId, assistant.selectedVariantId))
    .orderBy(messageReactions.id);
  const restored = await root.services.chat.listMessages({ principal, chatId: importedId });
  return {
    ...source,
    asset,
    injection,
    turn,
    imported,
    repeated,
    foreign,
    beforeForeign,
    afterForeign,
    whole,
    segment,
    removed,
    remaining,
    reactions,
    restored,
  };
}

async function compactAndRefuse(root: ServerTestHarness): Promise<CompactRefusalCapture> {
  const principal = await root.principalFor(root.ownerId);
  const compactRoom = await lifecycleRoom(root, "corpus-lifecycle-compact");
  await root.services.chat.commitMessage({
    principal,
    chatId: compactRoom.room.chat.id,
    content: "The keeper preserves a lifecycle witness.",
    timeZone: UTC_TIME_ZONE,
  });
  const compacted = await root.services.chat.compact({ principal, chatId: compactRoom.room.chat.id });
  const spend = await captureCompactionSpend(root.db, root.ownerId);
  const repeated = await root.services.chat.compact({ principal, chatId: compactRoom.room.chat.id });
  const repeatedSpend = await captureCompactionSpend(root.db, root.ownerId);
  const refusedRoom = await lifecycleRoom(root, "corpus-lifecycle-empty");
  let refusal: string | undefined;
  try {
    await root.services.chat.send({ principal, chatId: refusedRoom.room.chat.id, content: CORPUS_CHAT_EMPTY_CUE, timeZone: UTC_TIME_ZONE });
  } catch (error) {
    if (!(error instanceof ChatOperationError)) {
      throw error;
    }
    refusal = error.code;
  }
  const observations = await captureChatGenerationObservations(root.db, refusedRoom.room.chat.id);
  const canon = await root.services.chat.listMessages({ principal, chatId: refusedRoom.room.chat.id });
  return { compactRoom, compacted, spend, repeated, repeatedSpend, refusedRoom, refusal, observations, canon };
}

async function heldTurn(root: ServerTestHarness, wire: ChatWire, memberUserId: ServerTestHarness["ownerId"], abort: boolean): Promise<HeldTurnCapture> {
  const principal = await root.principalFor(root.ownerId);
  const source = await lifecycleRoom(root, abort ? "corpus-lifecycle-abort" : "corpus-lifecycle-held");
  const chatId = source.room.chat.id;
  const member = await root.principalFor(memberUserId);
  const invite = await seedChatInvite(root.db, root.services.chat.createInvite, { principal, chatId, input: { invitedHandle: member.handle } });
  await seedInvitedChatParticipant(root.db, root.services.chat.acceptInvite, { principal: member, inviteId: invite.id });
  const cue = abort ? CORPUS_CHAT_ABORT_CUE : CORPUS_CHAT_HELD_CUE;
  const hold = wire.hold(cue);
  const sending = root.services.chat.send({ principal, chatId, content: cue, timeZone: UTC_TIME_ZONE });
  let during: NativeReplay | undefined;
  let foreignRefusal: string | undefined;
  try {
    await Promise.race([
      hold.entered,
      sending.then(() => {
        throw new Error("native turn finished before its physical hold");
      }),
    ]);
    during = await captureChatReplayRows(root.db, chatId);
    try {
      await root.services.chat.abort({ principal: member, chatId });
    } catch (error) {
      if (!(error instanceof ChatOperationError)) {
        throw error;
      }
      foreignRefusal = error.code;
    }
    if (abort) {
      await root.services.chat.abort({ principal, chatId });
      await hold.aborted;
    }
  } finally {
    hold.release();
  }
  const turn = await sending;
  const completed = await captureChatReplayRows(root.db, chatId);
  const stream = await root.services.chat.replayStreamEvents({ principal, chatId, afterSeq: 0 });
  const events = await root.services.chat.replayChatEvents({ principal, chatId, afterSeq: 0 });
  const canon = await root.services.chat.listMessages({ principal, chatId });
  await root.services.chat.abort({ principal, chatId });
  return { ...source, invite, during, foreignRefusal, turn, completed, stream, events, canon };
}

async function deferAndHandoff(
  root: ServerTestHarness,
  memberUserId: ServerTestHarness["ownerId"],
  dbHold: Pick<DbStatementHold, "hold">,
): Promise<DeferredHandoffCapture> {
  const principal = await root.principalFor(root.ownerId);
  const member = await root.principalFor(memberUserId);
  const source = await lifecycleRoom(root, "corpus-lifecycle-deferred");
  const chatId = source.room.chat.id;
  const invite = await seedChatInvite(root.db, root.services.chat.createInvite, { principal, chatId, input: { invitedHandle: member.handle } });
  const participant = await seedInvitedChatParticipant(root.db, root.services.chat.acceptInvite, { principal: member, inviteId: invite.id });
  const submitted = await root.services.chat.send({ principal: member, chatId, content: CORPUS_CHAT_DEFERRED_CUE, timeZone: UTC_TIME_ZONE });
  const deferred = await captureChatReplayRows(root.db, chatId);
  const drained = await root.services.chat.drainDeferredTurns({ hostUserId: root.ownerId });
  const drainRepeated = await root.services.chat.drainDeferredTurns({ hostUserId: root.ownerId });
  const completed = await captureChatReplayRows(root.db, chatId);
  await root.services.chat.nominateHostHandoff({ principal, chatId, userId: member.userId, offer: { copyCharacters: true, copyGmPreset: false } });
  const hold = dbHold.hold(/^delete from "chat_handoff_resumptions"/u);
  const accepting = root.services.chat.acceptHostHandoff({ principal: member, chatId });
  let marker: DeferredHandoffCapture["marker"];
  let accepted: DeferredHandoffCapture["accepted"];
  let oldHostRefusal: string | undefined;
  try {
    await Promise.race([
      hold.reached,
      accepting.then(() => {
        throw new Error("native handoff finished before its completion fence");
      }),
    ]);
    marker = await captureChatHandoffResumption(root.db, chatId);
    accepted = await root.services.chat.getChat({ principal: member, chatId });
    try {
      await root.services.chat.acceptHostHandoff({ principal, chatId });
    } catch (error) {
      if (!(error instanceof ChatOperationError)) {
        throw error;
      }
      oldHostRefusal = error.code;
    }
  } finally {
    hold.release();
    await accepting;
  }
  const finalMarker = await captureChatHandoffResumption(root.db, chatId);
  const final = await root.services.chat.getChat({ principal: member, chatId });
  const sourceSeat = source.room.chat.participants.find((seat) => seat.kind === "character" && seat.characterId === source.character.id);
  if (sourceSeat === undefined) {
    throw new Error("native handoff source has no character participant identity");
  }
  const acceptedSeat = accepted.participants.find((seat) => seat.id === sourceSeat.id);
  const finalSeat = final.participants.find((seat) => seat.id === sourceSeat.id);
  if (
    acceptedSeat === undefined ||
    acceptedSeat.kind !== "character" ||
    acceptedSeat.characterId === null ||
    finalSeat === undefined ||
    finalSeat.kind !== "character" ||
    finalSeat.characterId === null
  ) {
    throw new Error("native handoff lost its retained copied-character seat or target");
  }
  const copiedCharacter = await root.services.character.get({ principal: member, characterId: acceptedSeat.characterId });
  return {
    ...source,
    invite,
    participant,
    submitted,
    deferred,
    drained,
    drainRepeated,
    completed,
    marker,
    accepted,
    oldHostRefusal,
    finalMarker,
    final,
    acceptedSeat,
    finalSeat,
    copiedCharacter,
  };
}

/** The actual owner connection funds every lifecycle reply; stable canon outlives fully released holds. */
export async function seedCorpusChatLifecycle(
  root: ServerTestHarness,
  wire: ChatWire,
  memberUserId: ServerTestHarness["ownerId"],
  dbHold: Pick<DbStatementHold, "hold">,
): Promise<CorpusChatLifecycle> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({ name: "Lifecycle corpus preset", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const connection = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_CHAT_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { input: ["text", "image"], context: { window: 32_000 } },
      features: { detectServer: false, pricing: { inputPerMTok: 1, outputPerMTok: 2 } },
    },
  });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const imported = await importAndReact(root, memberUserId);
  const compacted = await compactAndRefuse(root);
  const held = await heldTurn(root, wire, memberUserId, false);
  const aborted = await heldTurn(root, wire, memberUserId, true);
  const handoff = await deferAndHandoff(root, memberUserId, dbHold);
  await root.settleBackground();
  return { connection, imported, compacted, held, aborted, handoff };
}
