// Native room projections retain their stage and viewer; only the external provider is scripted.

import { createCharacterSchema } from "@orb/contracts/character";
import { groupConfigSchema } from "@orb/contracts/chat";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { TOOL_RECURSE_LIMIT_DEFAULT } from "../../../packages/server/src/domain/chat/contract/metadata.ts";
import { seedCorpusActors } from "./corpus-actors.ts";
import type { ServerTestHarness } from "./server.ts";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type ChatReads = {
  readonly [P in keyof Pick<
    Caller["chat"],
    | "countChats"
    | "getChat"
    | "getChatLineage"
    | "checkSendAvailability"
    | "getNextTurnConnection"
    | "getMemberCard"
    | "listMessages"
    | "getMessageWindow"
    | "listMessageVariants"
    | "listEffectiveRegex"
    | "getUserMacroPicks"
    | "getVariablePicks"
    | "getRuntimeVariables"
    | "listReactions"
    | "previewAssembly"
    | "previewActionTemplates"
    | "getShapeTrace"
    | "getVariantWire"
    | "previewContextFit"
    | "listChatInjections"
    | "getGroupConfig"
  >]: Awaited<ReturnType<Caller["chat"][P]>>;
};
type ChatUpdates = {
  readonly [P in keyof Pick<
    Caller["chat"],
    | "setRoomOverrides"
    | "setChatDocumentVisibility"
    | "setChatBackground"
    | "setHostDisplayScripts"
    | "setRegexAllow"
    | "setOfferChoices"
    | "setCharactersCanReact"
    | "setReactionsEnabled"
    | "setMemberPersonaLore"
    | "setToolRecurseLimit"
    | "setChatInjection"
    | "setSeatKnobs"
    | "setGroupConfig"
  >]: Awaited<ReturnType<Caller["chat"][P]>>;
};
interface CorpusChatOutputs {
  readonly room: Awaited<ReturnType<Caller["chat"]["startChat"]>>;
  readonly unbound: Pick<ChatReads, "checkSendAvailability" | "getNextTurnConnection" | "previewContextFit">;
  readonly turn: Awaited<ReturnType<Caller["chat"]["send"]>>;
  readonly swiped: Awaited<ReturnType<Caller["chat"]["swipe"]>>;
  readonly edited: Awaited<ReturnType<Caller["chat"]["editMessage"]>>;
  readonly updates: ChatUpdates;
  readonly reads: ChatReads;
  readonly fork: Awaited<ReturnType<Caller["chat"]["forkChat"]>>;
  readonly pages: readonly Awaited<ReturnType<Caller["chat"]["listChats"]>>[];
  readonly older: ChatReads["listMessages"];
  readonly deletedWindow: ChatReads["getMessageWindow"];
  readonly member: Pick<ChatReads, "getChat" | "listMessages" | "getMessageWindow" | "getMemberCard" | "getNextTurnConnection">;
  readonly history: ChatReads["listMessages"];
  readonly invitation: {
    readonly created: Awaited<ReturnType<Caller["invites"]["createInvite"]>>;
    readonly preview: Awaited<ReturnType<Caller["invites"]["previewInvite"]>>;
    readonly joined: Awaited<ReturnType<Caller["invites"]["redeemInvite"]>>;
    readonly listed: Awaited<ReturnType<Caller["invites"]["listInvites"]>>;
  };
  readonly reaped: Awaited<ReturnType<Caller["chat"]["reapTemporaryChats"]>>;
}

export const CHAT_OUTPUT_BODY = "The orbital witness is public.";
export const CHAT_OUTPUT_SECRET = "private-loom-cipher";
export const CHAT_OUTPUT_CONNECTION_LABEL = "Private orbital connection label";

/** Capture a room's real output graph without replacing its policy, readers or canonical writers. */
export async function seedCorpusChatOutputs(root: ServerTestHarness): Promise<CorpusChatOutputs> {
  let caller = await root.internalCallerFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "corpus-chat-outputs", name: "Output witness", description: "A keeper protects the orbital ledger." }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  const chatId = room.chat.id;
  const scope = { chatId };
  const unbound = {
    checkSendAvailability: await caller.chat.checkSendAvailability(scope),
    getNextTurnConnection: await caller.chat.getNextTurnConnection(scope),
    previewContextFit: await caller.chat.previewContextFit(scope),
  };
  const actors = await seedCorpusActors(root);
  await caller.settings.updateAppSettings({ partial: { localMultiUser: true } });
  caller = await root.internalCallerFor(root.ownerId);
  const member = await root.internalCallerFor(actors.secondUserId);
  await root.services.connection.update({ principal: actors.owner, connectionId: actors.connections.text.id, patch: { label: CHAT_OUTPUT_CONNECTION_LABEL } });
  const preset = await caller.preset.create({ name: "Room output witness", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const seat = room.chat.participants.find((participant) => participant.characterId === character.id);
  if (seat === undefined) {
    throw new Error("native chat output room has no founding character seat");
  }
  const updates = {
    setRoomOverrides: await caller.chat.setRoomOverrides({ ...scope, overrides: { scenario: "The orbital witness guards the loom." } }),
    setChatDocumentVisibility: await caller.chat.setChatDocumentVisibility({ ...scope, visibility: { hidden: [] } }),
    setChatBackground: await caller.chat.setChatBackground({ ...scope, background: themeBackgroundSchema.parse({ kind: "none" }) }),
    setHostDisplayScripts: await caller.chat.setHostDisplayScripts({ ...scope, enabled: false }),
    setRegexAllow: await caller.chat.setRegexAllow({ ...scope, lever: { kind: "master", enabled: false } }),
    setOfferChoices: await caller.chat.setOfferChoices({ ...scope, enabled: false }),
    setCharactersCanReact: await caller.chat.setCharactersCanReact({ ...scope, enabled: false }),
    setReactionsEnabled: await caller.chat.setReactionsEnabled({ ...scope, enabled: true }),
    setMemberPersonaLore: await caller.chat.setMemberPersonaLore({ ...scope, enabled: false }),
    setToolRecurseLimit: await caller.chat.setToolRecurseLimit({ ...scope, limit: TOOL_RECURSE_LIMIT_DEFAULT }),
    setChatInjection: await caller.chat.setChatInjection({
      ...scope,
      position: "in_chat",
      depth: 0,
      role: "system",
      content: "Preserve the orbital witness.",
      order: 0,
    }),
    setSeatKnobs: await caller.chat.setSeatKnobs({ ...scope, participantId: seat.id, patch: { talkativeness: seat.talkativeness, disabled: false } }),
    setGroupConfig: await caller.chat.setGroupConfig({
      ...scope,
      config: groupConfigSchema.parse({ output: "per-speaker", policy: "list", memberCardVisibility: "name-avatar" }),
    }),
  };
  const turn = await caller.chat.send({ ...scope, content: "Record the orbital witness.", timeZone: UTC_TIME_ZONE });
  const assistant = turn.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("native chat output turn has no selected assistant");
  }
  const swiped = await caller.chat.swipe({ ...scope, messageId: assistant.id, timeZone: UTC_TIME_ZONE });
  const edited = await caller.chat.editMessage({
    ...scope,
    messageId: assistant.id,
    content: `${CHAT_OUTPUT_BODY} <lie character="Output witness" type="secret" truth="${CHAT_OUTPUT_SECRET}" reason="private"/>`,
    timeZone: UTC_TIME_ZONE,
  });
  const created = await caller.invites.createInvite({ ...scope, input: { maxUses: 2 } });
  const preview = await member.invites.previewInvite({ token: created.token });
  const joined = await member.invites.redeemInvite({ token: created.token });
  const listed = await caller.invites.listInvites(scope);
  const target = { kind: "message", messageId: assistant.id } as const;
  const memberReads = {
    getChat: await member.chat.getChat(scope),
    listMessages: await member.chat.listMessages(scope),
    getMessageWindow: await member.chat.getMessageWindow({ ...scope, target, limit: 1 }),
    getMemberCard: await member.chat.getMemberCard({ ...scope, characterId: character.id, timeZone: UTC_TIME_ZONE }),
    getNextTurnConnection: await member.chat.getNextTurnConnection(scope),
  };
  await caller.invites.setMemberHistoryVisibility({ ...scope, userId: actors.secondUserId, visibility: "from-join" });
  const history = await member.chat.listMessages(scope);
  const reads = {
    countChats: await caller.chat.countChats(),
    getChat: await caller.chat.getChat(scope),
    getChatLineage: await caller.chat.getChatLineage(scope),
    checkSendAvailability: await caller.chat.checkSendAvailability(scope),
    getNextTurnConnection: await caller.chat.getNextTurnConnection(scope),
    getMemberCard: await caller.chat.getMemberCard({ ...scope, characterId: character.id, timeZone: UTC_TIME_ZONE }),
    listMessages: await caller.chat.listMessages({ ...scope, limit: 1 }),
    getMessageWindow: await caller.chat.getMessageWindow({ ...scope, target, limit: 1 }),
    listMessageVariants: await caller.chat.listMessageVariants({ ...scope, messageId: assistant.id }),
    listEffectiveRegex: await caller.chat.listEffectiveRegex(scope),
    getUserMacroPicks: await caller.chat.getUserMacroPicks(scope),
    getVariablePicks: await caller.chat.getVariablePicks(scope),
    getRuntimeVariables: await caller.chat.getRuntimeVariables(scope),
    listReactions: await caller.chat.listReactions(scope),
    previewAssembly: await caller.chat.previewAssembly({ ...scope, timeZone: UTC_TIME_ZONE }),
    previewActionTemplates: await caller.chat.previewActionTemplates({ ...scope, presetId: preset.id, timeZone: UTC_TIME_ZONE }),
    getShapeTrace: await caller.chat.getShapeTrace(scope),
    getVariantWire: await caller.chat.getVariantWire({ ...scope, variantId: assistant.selectedVariantId }),
    previewContextFit: await caller.chat.previewContextFit(scope),
    listChatInjections: await caller.chat.listChatInjections(scope),
    getGroupConfig: await caller.chat.getGroupConfig(scope),
  };
  const older = await caller.chat.listMessages({ ...scope, beforeSeq: edited.seq, limit: 1 });
  await member.invites.selfLeave(scope);
  const fork = await caller.chat.forkChat(scope);
  reads.getChatLineage = await caller.chat.getChatLineage({ chatId: fork.chat.id });
  const first = await caller.chat.listChats({ limit: 1 });
  const second = await caller.chat.listChats({ limit: 1, cursor: first.nextCursor });
  const third = await caller.chat.listChats({ limit: 1, cursor: second.nextCursor });
  const deletedWindow = await caller.chat.getMessageWindow({ ...scope, target: { kind: "message", messageId: root.idSource.typeId("message") } });
  const reaped = await caller.chat.reapTemporaryChats();
  return {
    room,
    unbound,
    turn,
    swiped,
    edited,
    updates,
    reads,
    fork,
    pages: [first, second, third],
    older,
    deletedWindow,
    member: memberReads,
    history,
    invitation: { created, preview, joined, listed },
    reaped,
  };
}
