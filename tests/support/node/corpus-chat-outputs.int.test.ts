// @subject tests/support/node/corpus-chat-outputs.ts
import { assertReferentialIntegrity } from "@orb/db";
import { CHAT_OUTPUT_BODY, CHAT_OUTPUT_CONNECTION_LABEL, CHAT_OUTPUT_SECRET, seedCorpusChatOutputs } from "./corpus-chat-outputs.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("native chat output suppliers retain exact canon, viewer projections, page boundaries and fork lineage", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: CHAT_OUTPUT_BODY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: provider.execute, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
  const result = await seedCorpusChatOutputs(root);
  const { reads, updates, member, invitation } = result;
  const assistant = result.turn.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("native output supplier has no assistant");
  }
  expect(result.room.chat.viewerUserId).toBe(root.ownerId);
  expect(result.room.chat.participants.filter((seat) => seat.role === "host").map((seat) => [seat.chatId, seat.userId])).toEqual([
    [result.room.chat.id, root.ownerId],
  ]);
  expect(result.room.opening).toBeNull();
  expect(result.unbound.getNextTurnConnection).toEqual({ state: "unset" });
  expect(result.unbound.checkSendAvailability.available).toBe(false);
  expect(result.unbound.previewContextFit).toEqual({ unbound: true });
  expect(reads.checkSendAvailability).toEqual({ available: true });
  expect(reads.getNextTurnConnection).toMatchObject({ state: "configured", connectionLabel: CHAT_OUTPUT_CONNECTION_LABEL, model: CORPUS_TEXT_MODEL });
  expect(member.getNextTurnConnection).toMatchObject({ state: "configured", connectionLabel: null, model: CORPUS_TEXT_MODEL });
  expect(reads.getChat.viewerIsHost).toBe(true);
  expect(member.getChat.viewerIsHost).toBe(false);
  expect(member.getChat.viewerUserId).toBe(invitation.joined.participant.userId);
  expect(invitation.joined.chat.id).toBe(result.room.chat.id);
  expect(invitation.joined.chat.participants).toContainEqual(invitation.joined.participant);
  expect(invitation.created.invite.remainingUses).toBe(2);
  expect(invitation.preview.chatId).toBe(result.room.chat.id);
  expect(invitation.preview.hostHandle).toBe(result.room.chat.participants.find((seat) => seat.role === "host")?.handle);
  expect(invitation.preview).not.toHaveProperty("participants");
  expect(invitation.preview).not.toHaveProperty("messages");
  expect(invitation.listed).toMatchObject([{ id: invitation.created.invite.id, remainingUses: 1 }]);
  expect(JSON.stringify(invitation.listed)).not.toContain(invitation.created.token);
  expect(reads.getMemberCard.visibility).toBe("full");
  expect(reads.getMemberCard.description).toBe("A keeper protects the orbital ledger.");
  expect(member.getMemberCard).toMatchObject({
    characterId: reads.getMemberCard.characterId,
    visibility: "name-avatar",
    description: null,
    personality: null,
    greetings: null,
  });
  expect(reads.listMessages.messages).toEqual([result.edited]);
  expect(result.older.messages.map((message) => [message.role, message.seq])).toEqual([["user", assistant.seq - 1]]);
  expect(reads.listMessageVariants.map((variant) => [variant.variantId, variant.idx])).toEqual([
    [assistant.selectedVariantId, 0],
    [result.edited.selectedVariantId, 1],
  ]);
  expect(result.edited.id).toBe(assistant.id);
  expect(result.edited.selectedVariantId).toBe(result.swiped.messages[0]?.selectedVariantId);
  expect(result.edited.selectedVariantId).not.toBe(assistant.selectedVariantId);
  expect(result.edited.chatId).toBe(result.room.chat.id);
  expect(result.edited.content).toContain(CHAT_OUTPUT_SECRET);
  expect(member.listMessages.messages.find((message) => message.id === assistant.id)?.content).toBe(`${CHAT_OUTPUT_BODY} `);
  expect(JSON.stringify(member)).not.toContain(CHAT_OUTPUT_SECRET);
  expect(JSON.stringify(member)).not.toContain(CHAT_OUTPUT_CONNECTION_LABEL);
  expect(result.history.messages.map((message) => [message.id, message.seq])).toEqual([[assistant.id, invitation.joined.participant.joinSeq]]);
  expect(result.history.messages.some((message) => message.role === "user")).toBe(false);
  expect(reads.getMessageWindow).toMatchObject({
    outcome: "resolved",
    anchorMessageId: assistant.id,
    anchorSeq: assistant.seq,
    hasBefore: true,
    hasAfter: false,
  });
  expect(member.getMessageWindow.messages.map((message) => message.id)).toEqual([assistant.id]);
  expect(result.deletedWindow).toMatchObject({ outcome: "deleted", messages: [], anchorMessageId: null });
  expect(result.fork.chat.parentChatId).toBe(result.room.chat.id);
  expect(reads.getChatLineage.chain.map((chat) => chat.id)).toEqual([result.room.chat.id, result.fork.chat.id]);
  expect(result.pages.map((page) => page.totalCount)).toEqual([reads.countChats + 1, reads.countChats + 1, reads.countChats + 1]);
  expect(result.pages[0]?.items[0]?.id).not.toBe(result.pages[1]?.items[0]?.id);
  expect(result.pages[0]?.nextCursor?.id).toBe(result.pages[0]?.items[0]?.id);
  expect(result.pages[1]?.nextCursor?.id).toBe(result.pages[1]?.items[0]?.id);
  expect(result.pages[2]).toMatchObject({ items: [], nextCursor: null });
  expect(updates.setRoomOverrides).toEqual(reads.getChat.roomOverrides);
  expect(updates.setChatDocumentVisibility).toEqual({ hidden: [] });
  expect(updates.setChatBackground).toEqual(reads.getChat.background);
  expect(updates.setHostDisplayScripts).toBe(reads.getChat.hostDisplayScripts);
  expect(updates.setOfferChoices).toBe(reads.getChat.offerChoices);
  expect(updates.setCharactersCanReact).toBe(reads.getChat.charactersCanReact);
  expect(updates.setReactionsEnabled).toBe(reads.getChat.reactionsEnabled);
  expect(updates.setMemberPersonaLore).toBe(reads.getChat.memberPersonaLore);
  expect(updates.setToolRecurseLimit).toBe(reads.getChat.toolRecurseLimit);
  expect(updates.setSeatKnobs.chatId).toBe(result.room.chat.id);
  expect(reads.getChat.participants.find((seat) => seat.id === updates.setSeatKnobs.id)).toMatchObject(updates.setSeatKnobs);
  expect(updates.setGroupConfig).toEqual(reads.getGroupConfig);
  expect(reads.getChat.group).toEqual(reads.getGroupConfig);
  expect(reads.listChatInjections).toEqual([updates.setChatInjection]);
  expect(reads.listEffectiveRegex).toMatchObject({ enabled: false, effective: [] });
  expect(updates.setRegexAllow.enabled).toBe(false);
  expect(reads.getUserMacroPicks).toEqual({ macros: [], values: {} });
  expect(reads.getVariablePicks).toEqual({ variables: [], values: {} });
  expect(reads.getRuntimeVariables).toEqual({});
  expect(reads.listReactions).toMatchObject({ reactionsEnabled: true, groups: [] });
  expect(reads.previewActionTemplates.identity.char).toBe(reads.getMemberCard.name);
  expect(reads.previewActionTemplates.templates.length).toBeGreaterThan(0);
  expect(JSON.stringify(reads.previewAssembly.prompt)).toContain(updates.setRoomOverrides.scenario);
  expect(reads.previewAssembly.budget.totalTokens).toBeGreaterThan(0);
  expect(reads.getShapeTrace.rows.length).toBeGreaterThan(0);
  expect(reads.getVariantWire.variantId).toBe(assistant.selectedVariantId);
  expect(reads.getVariantWire.prompt).not.toBeNull();
  expect(reads.previewContextFit).not.toHaveProperty("unbound");
  expect(result.reaped).toEqual({ reaped: 0 });
  expect(provider.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(2);
  const departedUserId = invitation.joined.participant.userId;
  if (departedUserId === null) {
    throw new Error("native invitation joined no human identity");
  }
  const departed = await root.internalCallerFor(departedUserId);
  await expect(departed.chat.getMessageWindow({ chatId: result.room.chat.id, target: { kind: "message", messageId: assistant.id } })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  const foreignRoom = await departed.chat.startChat({ characterIds: [], opening: "none" });
  await expect(departed.chat.getVariantWire({ chatId: foreignRoom.chat.id, variantId: assistant.selectedVariantId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await assertReferentialIntegrity(root.db);
});
