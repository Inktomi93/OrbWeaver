// @subject packages/server/src/entry/compose/imagery.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { isAdmin, isOwner } from "@orb/server/domain/admin";
import type { ImageryRoomAccessDeps } from "@orb/server/domain/chat";
import {
  createImageryRoomAccess,
  createResolveMediaRef,
  createResolveViewerVisibility,
  isCharacterSeated,
  loadPresentHostUserId,
} from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
  seedChat,
  seedCorpusActors,
  seedMessage,
} from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { actor, PNG, seatMember, subjectOf } from "./media-and-imagery-authority.fixtures.ts";

test("composed imagery card reads carry the row-derived host role rather than a synthetic user role", async ({ harness, services }) => {
  const host = await actor(harness, "admin");
  const member = await actor(harness);
  const subject = await subjectOf(harness, host);
  const {
    view: { chat: room },
  } = await seedChat(harness, { principal: host, characterIds: [subject.id] });
  await seatMember(harness, host, room.id, member);
  const getCard = vi.spyOn(services.character, "getCard");
  await expect(services.imagery.extractPrompt({ caller: member, chatId: room.id, mode: "character", subjectCharacterId: subject.id })).rejects.toThrow();
  expect(getCard).toHaveBeenCalledExactlyOnceWith({
    principal: expect.objectContaining({ userId: host.userId, handle: host.handle }),
    characterId: subject.id,
  });
  const captured = getCard.mock.calls[0]?.[0].principal;
  if (captured === undefined) {
    throw new Error("the real imagery path did not resolve its host Principal");
  }
  expect(isAdmin(captured)).toBe(true);
  expect(isOwner(captured)).toBe(false);
});

test("room admission and subject seating run before host principal, card or Utility spend", async ({ harness, db, services }) => {
  const host = await actor(harness, "admin");
  const member = await actor(harness);
  const outsider = await actor(harness, "admin");
  const subject = await subjectOf(harness, host);
  const {
    view: { chat: room },
  } = await seedChat(harness, { principal: host, characterIds: [] });
  const resolveHostPrincipal = vi.fn(() => Promise.resolve(host));
  const resolveChatHostUserId = vi.fn<ImageryRoomAccessDeps["resolveChatHostUserId"]>((chatId) => loadPresentHostUserId(databaseHandle(db), chatId));
  const access = createImageryRoomAccess({
    resolveViewerVisibility: createResolveViewerVisibility({ db: databaseHandle(db) }),
    resolveChatHostUserId,
    isCharacterSeated: (chatId, characterId) => isCharacterSeated(databaseHandle(db), chatId, characterId),
    resolveHostPrincipal,
  });
  await seatMember(harness, host, room.id, member);
  await expect(access.resolveRoomRunAs(outsider, room.id, subject.id)).rejects.toMatchObject({ name: "DomainNotFoundError" });
  expect(resolveChatHostUserId).not.toHaveBeenCalled();
  await expect(access.resolveRoomRunAs(member, room.id, subject.id)).rejects.toMatchObject({ name: "DomainNotFoundError" });
  expect(resolveHostPrincipal).not.toHaveBeenCalled();
  expect(await access.resolveRoomRunAs(host, room.id, subject.id)).toBe(host);
  await services.chat.addCharacterToChat({ principal: host, chatId: room.id, characterId: subject.id });
  expect(await access.resolveRoomRunAs(member, room.id, subject.id)).toBe(host);
  expect(await access.callerInChat(member, room.id)).toBe(true);
  expect(await access.callerInChat(outsider, room.id)).toBe(false);
});

test("quiet extraction sends only the caller's visible scene through the host's real funded provider path", async () => {
  const prejoinText = "prejoin-secret";
  const visibleText = "visible-scene";
  const hiddenText = "hidden-scene";
  const extractedPrompt = "visible scene keywords";
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: extractedPrompt,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const requests: Request[] = [];
  await using root = await createServerHarness({
    authConfig: { mode: "forward-header", fallback: "deny" },
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      return await physical.execute(request);
    },
  });
  const { owner: host, secondUserId } = await seedCorpusActors(root);
  const member = await root.principalFor(secondUserId);
  const hostCaller = await root.internalCallerFor(host.userId);
  const memberCaller = await root.internalCallerFor(member.userId);
  await root.services.connection.setBinding({ principal: member, task: "summarize", connectionId: null });
  expect(await root.services.connection.availability({ principal: member, task: "summarize" })).toMatchObject({ available: false });
  const subject = await hostCaller.character.create({
    input: createCharacterSchema.parse({ handle: "quiet-witness", name: "Quiet witness", description: "A host-owned scene witness." }),
  });
  const { chat } = await hostCaller.chat.startChat({ characterIds: [subject.id], opening: "none" });
  await hostCaller.chat.commitMessage({ chatId: chat.id, content: prejoinText, timeZone: UTC_TIME_ZONE });
  // Admission records the current canon head, so keep a public row at that boundary.
  await hostCaller.chat.commitMessage({ chatId: chat.id, content: "A public join boundary.", timeZone: UTC_TIME_ZONE });
  const invite = await hostCaller.invites.createInvite({ chatId: chat.id, input: { invitedHandle: member.handle } });
  await memberCaller.invites.acceptInvite({ inviteId: invite.invite.id });
  await hostCaller.invites.setMemberHistoryVisibility({ chatId: chat.id, userId: member.userId, visibility: "from-join" });
  await hostCaller.chat.commitMessage({ chatId: chat.id, content: `${visibleText} <lie truth="${hiddenText}"/>`, timeZone: UTC_TIME_ZONE });
  await root.settleBackground();

  const getCard = vi.spyOn(root.services.character, "getCard");
  const beforeExtraction = requests.length;
  const params = { chatId: chat.id, mode: "character" as const, subjectCharacterId: subject.id, timeZone: UTC_TIME_ZONE };
  const extracted = await root.services.imagery.extractPrompt({ caller: member, ...params });
  expect(extracted).toMatchObject({ prompt: extractedPrompt, source: "extracted" });
  expect(getCard).toHaveBeenCalledExactlyOnceWith({
    principal: expect.objectContaining({ userId: host.userId, role: host.role }),
    characterId: subject.id,
  });
  const extractionRequests = requests
    .slice(beforeExtraction)
    .filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(extractionRequests).toHaveLength(1);
  const extractionRequest = extractionRequests[0];
  if (extractionRequest === undefined) {
    throw new Error("the actual quiet extraction made no physical provider request");
  }
  const body = await extractionRequest.text();
  expect(JSON.parse(body)).toMatchObject({ model: CORPUS_TEXT_MODEL });
  expect(body).toContain(visibleText);
  expect(body).not.toContain(prejoinText);
  expect(body).not.toContain(hiddenText);

  const outsider = await root.principalFor((await root.actor()).id);
  const beforeRefusal = requests.length;
  await expect(root.services.imagery.extractPrompt({ caller: outsider, ...params })).rejects.toMatchObject({ name: "DomainNotFoundError" });
  expect(getCard).toHaveBeenCalledTimes(1);
  expect(requests).toHaveLength(beforeRefusal);
});

test("a present member's picture the room never placed reads no bytes, while a placed link admits the host's", async () => {
  await using root = await createServerHarness();
  const { owner: host, secondUserId } = await seedCorpusActors(root);
  const member = await root.principalFor(secondUserId);
  const { services, db } = root;
  const {
    view: { chat: room },
  } = await seedChat(root, { principal: host, characterIds: [] });
  await seatMember(root, host, room.id, member);
  const picture = (caller: Principal): Promise<{ readonly assetId: AssetId }> =>
    services.assets.store({ principal: caller, bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)), kind: "attachment", mime: PNG });
  const membersPicture = await picture(member);
  const drawn = await picture(host);
  // Placement is any room link to the asset; the host's own attached line is the production writer here.
  await seedMessage(root, { principal: host, chatId: room.id, content: `![drawn](asset:${drawn.assetId})`, attachmentAssetIds: [drawn.assetId] });
  const read = vi.spyOn(services.assets, "loadAssetBytes");
  const resolve = createResolveMediaRef({
    db: databaseHandle(db),
    assets: services.assets,
    mediaProcessing: { frameCount: () => Promise.resolve(1), prepareVideo: () => Promise.reject(new Error("a still image never prepares motion")) },
    forbidExternalMedia: () => false,
  });

  expect(await resolve({ ownerId: host.userId, chatId: room.id, ref: { kind: "asset", assetId: membersPicture.assetId } })).toBeNull();
  expect(read).not.toHaveBeenCalled();
  expect((await resolve({ ownerId: host.userId, chatId: room.id, ref: { kind: "asset", assetId: drawn.assetId } }))?.media).toBe("image");
  expect(read).toHaveBeenCalledExactlyOnceWith(drawn.assetId);
});
