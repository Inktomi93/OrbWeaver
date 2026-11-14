// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/server/src/domain/chat/guard.ts
// The chat read surface's gates through the composed root: who may inspect the assembled prompt, which rooms a
// library lists, what a search may reveal, and what a joiner's history floor withholds on the reads it covers.
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { MessageId, MessageVariantId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { seedCorpusConnections, seedPreset } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";
import { invitePerson, personaRoom } from "../persona-cache-physical.ts";
import { textRoom } from "../scenario-physical.ts";

type Principal = ChatRoot["owner"];
type ChatService = ChatRoot["root"]["services"]["chat"];

const SECRET_PROMPT = "SECRET-SYSPROMPT never reveal the assassin";
const SECRET_DESCRIPTION = "SECRET-DESC a knife under the silk";
const LIE = '<lie character="Kai" truth="the reliquary is already empty"/>';

async function commit(
  h: ChatRoot,
  principal: Principal,
  content: string,
): Promise<{ readonly id: MessageId; readonly seq: number; readonly variantId: MessageVariantId }> {
  const row = (await h.root.services.chat.commitMessage({ principal, chatId: h.chatId, content })).messages[0];
  if (row === undefined) {
    throw new Error("commitMessage returned no row");
  }
  return { id: row.id, seq: row.seq, variantId: row.selectedVariantId };
}

async function seqsFor(h: ChatRoot, principal: Principal): Promise<readonly number[]> {
  return (await h.root.services.chat.listMessages({ principal, chatId: h.chatId })).messages.map(({ seq }) => seq);
}

// Every chat service verb has one row, so a verb the service gains fails `tsc` until it is classified. `inspector` and
// `room-read` are driven below; `elsewhere` is a verb whose gate another case owns or that this file does not gate.
const READ_GATE_KINDS = ["inspector", "room-read", "elsewhere"] as const;
type ReadGate = (typeof READ_GATE_KINDS)[number];
const READ_GATES = {
  startChat: "elsewhere",
  countChats: "elsewhere",
  listChats: "elsewhere",
  listForks: "room-read",
  getChatLineage: "room-read",
  getChat: "room-read",
  checkSendAvailability: "room-read",
  getNextTurnConnection: "room-read",
  getMemberCard: "room-read",
  previewAssembly: "inspector",
  previewActionTemplates: "inspector",
  getShapeTrace: "inspector",
  getVariantWire: "inspector",
  previewContextFit: "elsewhere",
  listMessages: "room-read",
  getMessageWindow: "elsewhere",
  listMessageVariants: "room-read",
  listParticipants: "room-read",
  replayLiveTurn: "room-read",
  replayChatEvents: "room-read",
  chatEventBounds: "room-read",
  send: "elsewhere",
  commitMessage: "elsewhere",
  swipe: "elsewhere",
  impersonateStream: "elsewhere",
  generate: "elsewhere",
  continueTurn: "elsewhere",
  undoContinue: "elsewhere",
  revertContinue: "elsewhere",
  forceCharacterTurn: "elsewhere",
  compact: "elsewhere",
  abort: "elsewhere",
  drainDeferredTurns: "elsewhere",
  generateImage: "elsewhere",
  selectVariant: "elsewhere",
  editMessage: "elsewhere",
  setSeededGreeting: "elsewhere",
  applyProseRewrite: "elsewhere",
  setMessageHidden: "elsewhere",
  editToolCall: "elsewhere",
  deleteMessages: "elsewhere",
  editReasoning: "elsewhere",
  clearReasoning: "elsewhere",
  moveMessage: "elsewhere",
  duplicateMessage: "elsewhere",
  forkChat: "elsewhere",
  setChatInjection: "elsewhere",
  saveCorrection: "elsewhere",
  listChatInjections: "elsewhere",
  deleteChatInjection: "elsewhere",
  setVariables: "elsewhere",
  setUserMacroValues: "elsewhere",
  getUserMacroPicks: "elsewhere",
  getVariablePicks: "elsewhere",
  getRuntimeVariables: "elsewhere",
  toggleReaction: "elsewhere",
  listReactions: "elsewhere",
  delete: "elsewhere",
  reapTemporaryChats: "elsewhere",
  reapHusk: "elsewhere",
  updateTitle: "elsewhere",
  star: "elsewhere",
  archive: "elsewhere",
  setChatAnchorPersona: "elsewhere",
  reattributeMessages: "elsewhere",
  reattributePersona: "elsewhere",
  setGroupConfig: "elsewhere",
  addCharacterToChat: "elsewhere",
  removeCharacterFromChat: "elsewhere",
  setRoomOverrides: "elsewhere",
  setChatDocumentVisibility: "elsewhere",
  setChatBackground: "elsewhere",
  setHostDisplayScripts: "elsewhere",
  setRegexAllow: "elsewhere",
  listEffectiveRegex: "elsewhere",
  setOfferChoices: "elsewhere",
  setCharactersCanReact: "elsewhere",
  setReactionsEnabled: "elsewhere",
  setMemberPersonaLore: "elsewhere",
  setToolRecurseLimit: "elsewhere",
  getGroupConfigForChat: "elsewhere",
  setSeatKnobs: "elsewhere",
  createInvite: "elsewhere",
  previewInvite: "elsewhere",
  redeemInvite: "elsewhere",
  acceptInvite: "elsewhere",
  revokeInvite: "elsewhere",
  listInvites: "elsewhere",
  declineInvite: "elsewhere",
  kick: "elsewhere",
  setMemberHistoryVisibility: "elsewhere",
  selfLeave: "elsewhere",
  nominateHostHandoff: "elsewhere",
  acceptHostHandoff: "elsewhere",
} as const satisfies Record<keyof ChatService, ReadGate>;
type VerbsGated<G extends ReadGate> = { [K in keyof typeof READ_GATES]: (typeof READ_GATES)[K] extends G ? K : never }[keyof typeof READ_GATES];

async function codeOf(attempt: Promise<unknown>): Promise<unknown> {
  return await attempt.then(
    () => "resolved",
    (error: unknown) => (typeof error === "object" && error !== null && "code" in error ? error.code : error),
  );
}

test("the assembled-prompt inspectors are host-only, an outsider learns nothing, and member reads carry no card secrets", async () => {
  const card = createCharacterSchema.parse({ handle: "seraphine", name: "Seraphine", description: SECRET_DESCRIPTION, systemPrompt: SECRET_PROMPT });
  await using h = await textRoom([], { characters: [card] });
  const member = await invitePerson(h);
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  await h.root.services.chat.setGroupConfig({ principal: h.owner, chatId: h.chatId, config: { ...DEFAULT_GROUP_CONFIG, memberCardVisibility: "name-avatar" } });
  const line = await commit(h, h.owner, "hello");
  const preset = (await seedPreset(h.root, h.owner.userId, { name: "Inspector preset", kind: "custom" })).view;
  const scope = (principal: Principal): { principal: Principal; chatId: typeof h.chatId } => ({ principal, chatId: h.chatId });
  const inspectors: Record<VerbsGated<"inspector">, (principal: Principal) => Promise<unknown>> = {
    previewAssembly: (principal: Principal): Promise<unknown> => h.root.services.chat.previewAssembly(scope(principal)),
    previewActionTemplates: (principal: Principal): Promise<unknown> =>
      h.root.services.chat.previewActionTemplates({ ...scope(principal), presetId: preset.id }),
    getShapeTrace: (principal: Principal): Promise<unknown> => h.root.services.chat.getShapeTrace(scope(principal)),
    getVariantWire: (principal: Principal): Promise<unknown> => h.root.services.chat.getVariantWire({ ...scope(principal), variantId: line.variantId }),
  };

  for (const [name, inspect] of Object.entries(inspectors)) {
    // Positive control first: the same call by the host answers, so the refusals below are the gate and not a broken call.
    expect(await codeOf(inspect(h.owner)), name).toBe("resolved");
    expect(await codeOf(inspect(member)), name).toBe(CHAT_OP_CODES.notHost);
    await expect(inspect(stranger), name).rejects.toThrow(DomainNotFoundError);
  }

  // The prompt the member is refused really carries the full-only field; that is what the gate protects.
  expect(JSON.stringify(await h.root.services.chat.previewAssembly(scope(h.owner)))).toContain(SECRET_PROMPT);

  const fit = await h.root.services.chat.previewContextFit(scope(member));
  expect("unbound" in fit).toBe(false);
  expect(JSON.stringify(fit)).not.toContain("SECRET-");
});

test("a host cannot read another room's stored prompt by naming its variant, and the refusal matches an unknown id", async () => {
  await using h = await textRoom([]);
  const mine = h.chatId;
  const other = (await h.root.services.chat.startChat({ principal: h.owner, characterIds: [], opening: "none" })).chat.id;
  const theirLine = (await h.root.services.chat.commitMessage({ principal: h.owner, chatId: other, content: "their line" })).messages[0];
  if (theirLine === undefined) {
    throw new Error("the other room committed no row");
  }
  // Positive control: the same host reads that variant through the room it belongs to.
  await expect(h.root.services.chat.getVariantWire({ principal: h.owner, chatId: other, variantId: theirLine.selectedVariantId })).resolves.toMatchObject({
    variantId: theirLine.selectedVariantId,
  });

  const crossed = await h.root.services.chat
    .getVariantWire({ principal: h.owner, chatId: mine, variantId: theirLine.selectedVariantId })
    .catch((error: unknown) => error);
  const unknown = await h.root.services.chat
    // An id no row holds: the cast feeds the refusal path a well-formed but absent id.
    .getVariantWire({ principal: h.owner, chatId: mine, variantId: h.root.idSource.typeId(ID_PREFIX.messageVariant) })
    .catch((error: unknown) => error);
  expect(crossed).toBeInstanceOf(DomainNotFoundError);
  expect(unknown).toBeInstanceOf(DomainNotFoundError);
  expect(crossed instanceof Error && unknown instanceof Error && crossed.message === unknown.message).toBe(true);

  // The same belt on the sibling list: another room's slot is unreachable through this room, and answers through its own.
  await expect(h.root.services.chat.listMessageVariants({ principal: h.owner, chatId: mine, messageId: theirLine.id })).rejects.toThrow(DomainNotFoundError);
  expect((await h.root.services.chat.listMessageVariants({ principal: h.owner, chatId: other, messageId: theirLine.id })).length).toBe(1);
});

test("a non-participant gets a leak-free not-found on every room read, while the host and a member read the same room", async () => {
  await using h = await textRoom([]);
  const member = await invitePerson(h);
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  const line = await commit(h, h.owner, "hello");
  const characterId = h.characters[0]?.id;
  if (characterId === undefined) {
    throw new Error("the room seated no character");
  }
  const reads: Record<VerbsGated<"room-read">, (principal: Principal) => Promise<unknown>> = {
    getChat: (principal: Principal): Promise<unknown> => h.root.services.chat.getChat({ principal, chatId: h.chatId }),
    listMessages: (principal: Principal): Promise<unknown> => h.root.services.chat.listMessages({ principal, chatId: h.chatId }),
    listMessageVariants: (principal: Principal): Promise<unknown> =>
      h.root.services.chat.listMessageVariants({ principal, chatId: h.chatId, messageId: line.id }),
    listParticipants: (principal: Principal): Promise<unknown> => h.root.services.chat.listParticipants({ principal, chatId: h.chatId }),
    listForks: (principal: Principal): Promise<unknown> => h.root.services.chat.listForks({ principal, chatId: h.chatId }),
    getChatLineage: (principal: Principal): Promise<unknown> => h.root.services.chat.getChatLineage({ principal, chatId: h.chatId }),
    replayLiveTurn: (principal: Principal): Promise<unknown> => h.root.services.chat.replayLiveTurn({ principal, chatId: h.chatId, throughSeq: 0 }),
    replayChatEvents: (principal: Principal): Promise<unknown> => h.root.services.chat.replayChatEvents({ principal, chatId: h.chatId }),
    chatEventBounds: (principal: Principal): Promise<unknown> => h.root.services.chat.chatEventBounds({ principal, chatId: h.chatId }),
    checkSendAvailability: (principal: Principal): Promise<unknown> => h.root.services.chat.checkSendAvailability({ principal, chatId: h.chatId }),
    getNextTurnConnection: (principal: Principal): Promise<unknown> => h.root.services.chat.getNextTurnConnection({ principal, chatId: h.chatId }),
    getMemberCard: (principal: Principal): Promise<unknown> => h.root.services.chat.getMemberCard({ principal, chatId: h.chatId, characterId }),
  };
  for (const [name, read] of Object.entries(reads)) {
    expect(await codeOf(read(h.owner)), name).toBe("resolved");
    expect(await codeOf(read(member)), name).toBe("resolved");
    await expect(read(stranger), name).rejects.toThrow(DomainNotFoundError);
  }
});

test("a member lists only the forks they also belong to: a fork grants no membership in its parent, nor the parent's in the fork", async () => {
  await using h = await textRoom([]);
  const member = await invitePerson(h);
  await commit(h, h.owner, "a line to fork");
  const fork = await h.root.services.chat.forkChat({ principal: h.owner, chatId: h.chatId });

  const hostForks = await h.root.services.chat.listForks({ principal: h.owner, chatId: h.chatId });
  expect(hostForks.map(({ id }) => id)).toEqual([fork.chat.id]);
  // The member belongs to the parent only, so the fork is not theirs to list.
  expect(await h.root.services.chat.listForks({ principal: member, chatId: h.chatId })).toEqual([]);
  await expect(h.root.services.chat.getChat({ principal: member, chatId: fork.chat.id })).rejects.toThrow(DomainNotFoundError);
});

test("the library lists only the caller's rooms, hides archived and temporary ones, and names the caller's own role", async () => {
  await using h = await textRoom([]);
  const other = await h.root.principalFor((await h.root.actor()).id);
  await seedCorpusConnections(h.root, other);
  // A room with no line is a husk the library never lists, so every room here carries one.
  const start = async (principal: Principal, options: { readonly temporary?: boolean } = {}): Promise<typeof h.chatId> => {
    const chatId = (await h.root.services.chat.startChat({ principal, characterIds: [], opening: "none", ...options })).chat.id;
    await h.root.services.chat.commitMessage({ principal, chatId, content: "a line" });
    return chatId;
  };
  const live = await start(h.owner);
  const archived = await start(h.owner);
  const temporary = await start(h.owner, { temporary: true });
  const foreign = await start(other);
  await h.root.services.chat.archive({ principal: h.owner, chatId: archived, archived: true });
  const guested = await start(other);
  const invite = await h.root.services.chat.createInvite({ principal: other, chatId: guested, input: { invitedHandle: h.owner.handle } });
  await h.root.services.chat.acceptInvite({ principal: h.owner, inviteId: invite.invite.id });

  const listed = async (lens: { readonly includeArchived?: boolean } = {}): Promise<readonly string[]> =>
    (await h.root.services.chat.listChats({ principal: h.owner, ...lens })).items.map(({ id }) => id);
  const ids = await listed();
  expect(ids).toContain(live);
  expect(ids).toContain(guested);
  expect(ids).not.toContain(foreign);
  expect(ids).not.toContain(archived);
  expect(ids).not.toContain(temporary);
  // The archive lens widens the archive filter only; a temporary room never reaches the library.
  const everything = await listed({ includeArchived: true });
  expect(everything).toContain(archived);
  expect(everything).not.toContain(temporary);

  // The service holds a role as opaque data; the wire codec is what names it.
  const caller = await h.root.internalCallerFor(h.owner.userId);
  const roles = new Map((await caller.chat.listChats({})).items.map((item) => [item.id, item.viewerRole]));
  expect(roles.get(live)).toBe("host");
  expect(roles.get(guested)).toBe("member");
  expect(await h.root.services.chat.countChats({ principal: h.owner })).toBe(ids.length);
});

test("search and count never reveal a hidden span or pre-join text a member may not read", async () => {
  await using h = await textRoom([]);
  const member = await invitePerson(h);
  const floored = await invitePerson(h);
  await commit(h, h.owner, `The vault door is sealed. ${LIE}`);
  await h.root.services.chat.setMemberHistoryVisibility({ principal: h.owner, chatId: h.chatId, userId: floored.userId, visibility: "from-join" });
  await commit(h, h.owner, `The vault door is sealed. ${LIE}`);

  const find = async (principal: Principal, search: string): Promise<{ readonly listed: number; readonly counted: number }> => ({
    listed: (await h.root.services.chat.listChats({ principal, search })).items.length,
    counted: await h.root.services.chat.countChats({ principal, search }),
  });
  // The host reads canon verbatim, so its own search finds the span: the positive control for the absences.
  expect(await find(h.owner, "reliquary is already empty")).toEqual({ listed: 1, counted: 1 });
  expect(await find(member, "reliquary is already empty")).toEqual({ listed: 0, counted: 0 });
  expect(await find(floored, "reliquary is already empty")).toEqual({ listed: 0, counted: 0 });
  // The body arm is withheld whole on a tail that carries a hidden tag; fewer results, never a leak.
  expect(await find(member, "door is sealed")).toEqual({ listed: 0, counted: 0 });
});

test("a joiner reads the whole history by default, a promoted host is never clamped, and a re-join floors at the latest join", async () => {
  await using h = await textRoom([]);
  const first = await commit(h, h.owner, "before anyone joined");
  const atJoin = await commit(h, h.owner, "the head when they join");
  const joiner = await invitePerson(h);
  // No policy was named, so the column default applies and the whole canon is readable.
  expect(await seqsFor(h, joiner)).toEqual([first.seq, atJoin.seq]);

  await h.root.services.chat.setMemberHistoryVisibility({ principal: h.owner, chatId: h.chatId, userId: joiner.userId, visibility: "from-join" });
  const after = await commit(h, h.owner, "after the join");
  // The floor is inclusive: the row at the head when they joined is theirs, nothing below it.
  expect(await seqsFor(h, joiner)).toEqual([atJoin.seq, after.seq]);
  expect(await seqsFor(h, h.owner)).toEqual([first.seq, atJoin.seq, after.seq]);
  await h.root.services.chat.setMemberHistoryVisibility({ principal: h.owner, chatId: h.chatId, userId: joiner.userId, visibility: "full" });
  expect(await seqsFor(h, joiner)).toEqual([first.seq, atJoin.seq, after.seq]);
  await h.root.services.chat.setMemberHistoryVisibility({ principal: h.owner, chatId: h.chatId, userId: joiner.userId, visibility: "from-join" });
  expect(await seqsFor(h, joiner)).toEqual([atJoin.seq, after.seq]);

  // A host handoff keeps the member's from-join row; the promoted host still reads everything.
  await h.root.services.chat.nominateHostHandoff({ principal: h.owner, chatId: h.chatId, userId: joiner.userId });
  await h.root.services.chat.acceptHostHandoff({ principal: joiner, chatId: h.chatId });
  expect(await seqsFor(h, joiner)).toEqual([first.seq, atJoin.seq, after.seq]);

  // A line is funded through the host's chat binding, so the new host needs one.
  await seedCorpusConnections(h.root, joiner);
  // The new host restricts the old one, who leaves and is re-invited later: the floor moves to the latest join.
  await h.root.services.chat.setMemberHistoryVisibility({ principal: joiner, chatId: h.chatId, userId: h.owner.userId, visibility: "from-join" });
  await h.root.services.chat.selfLeave({ principal: h.owner, chatId: h.chatId });
  const later = await commit(h, joiner, "while the founder was away");
  const invite = await h.root.services.chat.createInvite({ principal: joiner, chatId: h.chatId, input: { invitedHandle: h.owner.handle } });
  await h.root.services.chat.acceptInvite({ principal: h.owner, inviteId: invite.invite.id });
  expect(await seqsFor(h, h.owner)).toEqual([later.seq]);
});

test("a from-join member cannot learn a pre-join slot's sibling variants, while the host and a post-join slot still answer", async () => {
  await using h = await personaRoom(["first", "second", "post-join"]);
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "open" });
  const pre = (await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.find(({ role }) => role === "assistant");
  if (pre === undefined) {
    throw new Error("the first turn wrote no assistant row");
  }
  await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: pre.id });
  // The floor is inclusive of the head at the join, so a line past the slot keeps the slot strictly below it.
  await commit(h, h.owner, "the head when they join");
  const joiner = await invitePerson(h);
  await h.root.services.chat.setMemberHistoryVisibility({ principal: h.owner, chatId: h.chatId, userId: joiner.userId, visibility: "from-join" });
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "after the join" });
  const post = (await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.findLast(({ role }) => role === "assistant");
  if (post === undefined || post.id === pre.id) {
    throw new Error("the post-join turn wrote no assistant row");
  }

  expect((await h.root.services.chat.listMessageVariants({ principal: h.owner, chatId: h.chatId, messageId: pre.id })).length).toBe(2);
  await expect(h.root.services.chat.listMessageVariants({ principal: joiner, chatId: h.chatId, messageId: pre.id })).rejects.toThrow(DomainNotFoundError);
  expect((await h.root.services.chat.listMessageVariants({ principal: joiner, chatId: h.chatId, messageId: post.id })).length).toBe(1);
});
