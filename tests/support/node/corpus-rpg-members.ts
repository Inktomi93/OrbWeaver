// Real invitations, host fork and offered handoff exercise the native game's authority and identity planes.
import { DomainError } from "@orb/kit/errors";
import { buildChatBundleFile, parseChatBundleFile } from "@orb/server/primitives/serde/chat-bundle";
import type { seedCorpusRpgRecursion } from "./corpus-rpg-recursion.ts";
import { seedChatInvite, seedImportedChatRows, seedInvitedChatParticipant } from "./factories/chat.ts";
import { captureRpgRows, captureRpgSnapshot, seedRpgCheckpoint, seedRpgJournalEntry } from "./factories/rpg.ts";
import type { ServerTestHarness } from "./server.ts";

export const RPG_MEMBER_SECRET = "the sealed observatory witness";
export const RPG_MEMBER_HIDDEN = `<lie character="Keeper" truth="${RPG_MEMBER_SECRET}"/>`;
export const RPG_HOST_STEERING = "Keep the host's private observatory direction.";
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Recursion = Awaited<ReturnType<typeof seedCorpusRpgRecursion>>;
type Tracker = Awaited<ReturnType<Caller["rpg"]["getTrackerView"]>>;
interface HistoricalPointerRecovery {
  readonly imported: Awaited<ReturnType<typeof seedImportedChatRows>>;
  readonly before: Awaited<ReturnType<Caller["chat"]["getChat"]>>;
  readonly missingGame: DomainError | undefined;
  readonly healed: Awaited<ReturnType<Caller["chat"]["getChat"]>>;
  readonly repeated: Awaited<ReturnType<Caller["chat"]["getChat"]>>;
}
interface CorpusRpgMembers {
  readonly participant: Awaited<ReturnType<typeof seedInvitedChatParticipant>>;
  readonly preset: Awaited<ReturnType<Caller["preset"]["create"]>>;
  readonly journal: Awaited<ReturnType<typeof seedRpgJournalEntry>>;
  readonly checkpoint: Awaited<ReturnType<typeof seedRpgCheckpoint>>;
  readonly checkpointBefore: Awaited<ReturnType<typeof captureRpgSnapshot>>;
  readonly checkpointAfter: Awaited<ReturnType<typeof captureRpgSnapshot>>;
  readonly attributeKey: string;
  readonly attributeValue: number;
  readonly hostTracker: Tracker;
  readonly memberTracker: Tracker;
  readonly memberJournal: Awaited<ReturnType<Caller["rpg"]["listJournal"]>>;
  readonly configRefusal: DomainError | undefined;
  readonly actorRefusal: DomainError | undefined;
  readonly sheetRefusal: DomainError | undefined;
  readonly resyncRefusal: DomainError | undefined;
  readonly forkRefusal: DomainError | undefined;
  readonly fullRefusal: DomainError | undefined;
  readonly detachRefusal: DomainError | undefined;
  readonly beforeFork: Awaited<ReturnType<typeof captureRpgRows>>;
  readonly fork: Awaited<ReturnType<Caller["chat"]["forkChat"]>>;
  readonly forkGame: Awaited<ReturnType<Caller["rpg"]["getGame"]>>;
  readonly forkRows: Awaited<ReturnType<typeof captureRpgRows>>;
  readonly forkTracker: Tracker;
  readonly forkJournal: Awaited<ReturnType<Caller["rpg"]["listJournal"]>>;
  readonly forkCheckpoints: Awaited<ReturnType<Caller["rpg"]["listCheckpoints"]>>;
  readonly forkCalls: Awaited<ReturnType<Caller["rpg"]["listTurnToolCalls"]>>;
  readonly forkMessages: Awaited<ReturnType<Caller["chat"]["listMessages"]>>;
  readonly handedChat: Awaited<ReturnType<Caller["chat"]["getChat"]>>;
  readonly copiedCharacter: Awaited<ReturnType<ServerTestHarness["services"]["character"]["get"]>>;
  readonly copiedPreset: Awaited<ReturnType<Caller["preset"]["get"]>>;
  readonly handedConfig: Awaited<ReturnType<Caller["rpg"]["getConfigView"]>>;
  readonly handedTracker: Tracker;
  readonly handedRows: Awaited<ReturnType<typeof captureRpgRows>>;
  readonly oldHostRefusal: DomainError | undefined;
  readonly recovery: Awaited<ReturnType<typeof recoverHistoricalPointer>>;
}

async function captureRefusal<T>(operation: Promise<T>): Promise<DomainError | undefined> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    if (!(error instanceof DomainError)) {
      throw error;
    }
    return error;
  }
}

async function recoverHistoricalPointer(root: ServerTestHarness, chatId: Recursion["room"]["chat"]["id"]): Promise<HistoricalPointerRecovery> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const exported = await root.app.exportService.exportChatBundle({ principal, chatId });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (exported === null || descriptor === undefined) {
    throw new Error("native RPG recovery export returned no portable chat");
  }
  const parsed = parseChatBundleFile(exported.bytes);
  if (!parsed.ok || parsed.value.rpg === null) {
    throw new Error("native RPG recovery export has no admitted campaign");
  }
  // Old-file intake admits missing campaign data independently of the retained chat metadata.
  const file = { ...exported, bytes: buildChatBundleFile({ ...parsed.value, rpg: null }) };
  const imported = await seedImportedChatRows(root.db, descriptor.importFile, [root.ownerId, file]);
  const importedChatId = imported.outcome.memoryChatIds?.[0];
  if (!imported.outcome.ok || importedChatId === undefined) {
    throw new Error("native historical RPG chat intake returned no imported identity");
  }
  const before = await caller.chat.getChat({ chatId: importedChatId });
  const missingGame = await captureRefusal(root.services.rpg.getGame({ principal, chatId: importedChatId }));
  await caller.rpg.detachDanglingPointer({ chatId: importedChatId });
  const healed = await caller.chat.getChat({ chatId: importedChatId });
  await caller.rpg.detachDanglingPointer({ chatId: importedChatId });
  const repeated = await caller.chat.getChat({ chatId: importedChatId });
  return { imported, before, missingGame, healed, repeated };
}

/** Preserve supported outcomes; a multi-human member fork is a refusal, not an invented member-owned copy. */
export async function seedCorpusRpgMembers(root: ServerTestHarness, source: Recursion, memberUserId: ServerTestHarness["ownerId"]): Promise<CorpusRpgMembers> {
  const principal = await root.principalFor(root.ownerId);
  const member = await root.principalFor(memberUserId);
  const caller = await root.internalCallerFor(root.ownerId);
  const memberCaller = await root.internalCallerFor(memberUserId);
  const chatId = source.room.chat.id;
  const actorRef = { kind: "character", characterId: source.character.id } as const;
  const invite = await seedChatInvite(root.db, root.services.chat.createInvite, { principal, chatId, input: { invitedHandle: member.handle } });
  const participant = await seedInvitedChatParticipant(root.db, root.services.chat.acceptInvite, { principal: member, inviteId: invite.id });
  const preset = await caller.preset.create({ name: "Offered observatory GM preset", kind: "custom" });
  await caller.rpg.updateConfig({ chatId, gmPresetId: preset.id, patch: { ruleset: "d20", steeringNote: RPG_HOST_STEERING } });
  const config = await caller.rpg.getConfigView({ chatId });
  const attribute = config.statProfile.attributes[0];
  if (attribute === undefined) {
    throw new Error("native d20 configuration has no attribute vocabulary");
  }
  const attributeKey = attribute.key;
  const attributeValue = config.statProfile.range.min;
  await root.services.rpg.patchSheet({ principal, chatId, actorRef, patch: { className: "Observatory warden", level: 3 } });
  await root.services.rpg.patchSheet({
    principal: member,
    chatId,
    actorRef: { kind: "user", userId: memberUserId },
    patch: { attributes: { [attributeKey]: attributeValue } },
  });
  await caller.rpg.patchActor({
    chatId,
    targetRef: actorRef,
    ops: [{ op: "addItem", item: { name: `Observatory key ${RPG_MEMBER_HIDDEN}`, description: `A hidden witness ${RPG_MEMBER_HIDDEN}` } }],
  });
  await caller.rpg.editSnapshot({ chatId, patch: { location: `Open observatory ${RPG_MEMBER_HIDDEN}` } });
  const journal = await seedRpgJournalEntry(root.db, root.services.rpg.addJournalEntry, {
    principal,
    chatId,
    type: "custom",
    label: "Host ledger",
    title: "Host ledger",
    content: `An open record ${RPG_MEMBER_HIDDEN}`,
  });
  const checkpoint = await seedRpgCheckpoint(root.db, root.services.rpg.createCheckpoint, { principal, chatId, label: "Observatory recovery" });
  const checkpointBefore = await captureRpgSnapshot(root.db, checkpoint.snapshotId);
  await caller.rpg.editSnapshot({ chatId, patch: { location: "Temporary observatory drift" } });
  const checkpointAfter = await captureRpgSnapshot(root.db, checkpoint.snapshotId);
  await caller.rpg.restoreCheckpoint({ chatId, checkpointId: checkpoint.id });
  const hostTracker = await caller.rpg.getTrackerView({ chatId });
  const memberTracker = await memberCaller.rpg.getTrackerView({ chatId });
  const memberJournal = await memberCaller.rpg.listJournal({ chatId });
  const configRefusal = await captureRefusal(root.services.rpg.getConfigView({ principal: member, chatId }));
  const actorRefusal = await captureRefusal(
    root.services.rpg.patchActor({ principal: member, chatId, targetRef: actorRef, ops: [{ op: "addItem", item: { name: "Unconsented key" } }] }),
  );
  const sheetRefusal = await captureRefusal(root.services.rpg.patchSheet({ principal: member, chatId, actorRef, patch: { level: 99 } }));
  const resyncRefusal = await captureRefusal(root.services.rpg.resyncFromStory({ principal: member, chatId }));
  const forkRefusal = await captureRefusal(root.services.chat.forkChat({ principal: member, chatId, title: "Refused member observatory fork" }));
  const fullRefusal = await captureRefusal(root.services.rpg.createGame({ principal, chatId, mode: "full" }));
  const detachRefusal = await captureRefusal(root.services.rpg.detachDanglingPointer({ principal, chatId }));
  const beforeFork = await captureRpgRows(root.db, source.game.id);
  const fork = await caller.chat.forkChat({ chatId, title: "Host observatory fork" });
  const forkGame = await caller.rpg.getGame({ chatId: fork.chat.id });
  const forkRows = await captureRpgRows(root.db, forkGame.id);
  const forkTracker = await caller.rpg.getTrackerView({ chatId: fork.chat.id });
  const forkJournal = await caller.rpg.listJournal({ chatId: fork.chat.id });
  const forkCheckpoints = await caller.rpg.listCheckpoints({ chatId: fork.chat.id });
  const forkCalls = await caller.rpg.listTurnToolCalls({ chatId: fork.chat.id });
  const forkMessages = await caller.chat.listMessages({ chatId: fork.chat.id });
  const recovery = await recoverHistoricalPointer(root, fork.chat.id);
  await root.services.chat.nominateHostHandoff({ principal, chatId, userId: memberUserId, offer: { copyCharacters: true, copyGmPreset: true } });
  await root.services.chat.acceptHostHandoff({ principal: member, chatId });
  const handedChat = await memberCaller.chat.getChat({ chatId });
  const sourceSeat = source.room.chat.participants.find((seat) => seat.characterId === source.character.id);
  const copiedSeat = handedChat.participants.find((seat) => seat.id === sourceSeat?.id);
  if (sourceSeat === undefined || copiedSeat === undefined || copiedSeat.kind !== "character" || copiedSeat.characterId === null) {
    throw new Error("native RPG handoff lost its retained character participant or copy");
  }
  const copiedCharacter = await root.services.character.get({ principal: member, characterId: copiedSeat.characterId });
  const handedConfig = await memberCaller.rpg.getConfigView({ chatId });
  if (handedConfig.gmPresetId === null) {
    throw new Error("native RPG handoff lost its offered GM preset");
  }
  const copiedPreset = await memberCaller.preset.get({ id: handedConfig.gmPresetId });
  const handedTracker = await memberCaller.rpg.getTrackerView({ chatId });
  const handedRows = await captureRpgRows(root.db, source.game.id);
  const oldHostRefusal = await captureRefusal(root.services.rpg.getConfigView({ principal, chatId }));
  await root.settleBackground();
  return {
    participant,
    preset,
    journal,
    checkpoint,
    checkpointBefore,
    checkpointAfter,
    attributeKey,
    attributeValue,
    hostTracker,
    memberTracker,
    memberJournal,
    configRefusal,
    actorRefusal,
    sheetRefusal,
    resyncRefusal,
    forkRefusal,
    fullRefusal,
    detachRefusal,
    beforeFork,
    fork,
    forkGame,
    forkRows,
    forkTracker,
    forkJournal,
    forkCheckpoints,
    forkCalls,
    forkMessages,
    handedChat,
    copiedCharacter,
    copiedPreset,
    handedConfig,
    handedTracker,
    handedRows,
    oldHostRefusal,
    recovery,
  };
}
