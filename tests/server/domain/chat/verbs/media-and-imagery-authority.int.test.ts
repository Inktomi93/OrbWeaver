// @subject packages/server/src/entry/compose/imagery.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { INLINE_REPLY_ORIGIN } from "@orb/contracts/chat";
import { DEFAULT_ATTACHMENT_QUALITY } from "@orb/contracts/inference";
import { chatParticipants, messageAssets } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { isAdmin, isOwner } from "@orb/server/domain/admin";
import type { ImageryRoomAccessDeps, ResolveMediaRefDeps } from "@orb/server/domain/chat";
import {
  createImageryRoomAccess,
  createResolveMediaRef,
  createResolveViewerVisibility,
  isCharacterSeated,
  loadPresentHostUserId,
} from "@orb/server/domain/chat";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors } from "@orb/testkit/node/corpus-seed.ts";
import { makeAssetBytes } from "@orb/testkit/node/factories/asset.ts";
import { seedCharacter } from "@orb/testkit/node/factories/character.ts";
import { seedChat } from "@orb/testkit/node/factories/chat.ts";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { and, eq } from "drizzle-orm";
import { vi } from "vitest";

const PNG = "image/png";

test("composed imagery card reads carry the row-derived host role rather than a synthetic user role", async ({ harness, db, services, ids, clock }) => {
  const room = await seedChat(db);
  const host = await seedUser(db, { role: "admin" });
  const member = await seedUser(db);
  const subject = await seedCharacter(db, { ownerId: host.id });
  await db.insert(chatParticipants).values([
    {
      id: typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant)),
      chatId: room.id,
      kind: "human",
      userId: host.id,
      role: "host",
      joinedAt: clock.now(),
      joinSeq: 0,
    },
    {
      id: typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant)),
      chatId: room.id,
      kind: "human",
      userId: member.id,
      role: "member",
      joinedAt: clock.now(),
      joinSeq: 0,
    },
    {
      id: typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant)),
      chatId: room.id,
      kind: "character",
      characterId: subject.id,
      role: "member",
      joinedAt: clock.now(),
      joinSeq: 0,
    },
  ]);
  const getCard = vi.spyOn(services.character, "getCard");
  await expect(
    services.imagery.extractPrompt({ caller: await principal(harness, member.id), chatId: room.id, mode: "character", subjectCharacterId: subject.id }),
  ).rejects.toThrow();
  expect(getCard).toHaveBeenCalledExactlyOnceWith({
    principal: expect.objectContaining({ userId: host.id, handle: host.handle }),
    characterId: subject.id,
  });
  const captured = getCard.mock.calls[0]?.[0].principal;
  if (captured === undefined) {
    throw new Error("the real imagery path did not resolve its host Principal");
  }
  expect(isAdmin(captured)).toBe(true);
  expect(isOwner(captured)).toBe(false);
});

test("room admission and subject seating run before host principal, card or Utility spend", async ({ harness, db, ids, clock }) => {
  const room = await seedChat(db);
  const hostRow = await seedUser(db, { role: "admin" });
  await db.insert(chatParticipants).values({
    id: typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant)),
    chatId: room.id,
    kind: "human",
    userId: hostRow.id,
    role: "host",
    joinedAt: clock.now(),
    joinSeq: 0,
  });
  const hostId = hostRow.id;
  const host = await principal(harness, hostId);
  const member = await principal(harness, (await seedUser(db)).id);
  const outsider = await principal(harness, (await seedUser(db, { role: "admin" })).id);
  const subject = await seedCharacter(db, { ownerId: hostId });
  const resolveHostPrincipal = vi.fn(() => Promise.resolve(host));
  const resolveChatHostUserId = vi.fn<ImageryRoomAccessDeps["resolveChatHostUserId"]>((chatId) => loadPresentHostUserId(databaseHandle(db), chatId));
  const access = createImageryRoomAccess({
    resolveViewerVisibility: createResolveViewerVisibility({ db: databaseHandle(db) }),
    resolveChatHostUserId,
    isCharacterSeated: (chatId, characterId) => isCharacterSeated(databaseHandle(db), chatId, characterId),
    resolveHostPrincipal,
  });
  await db.insert(chatParticipants).values({
    id: typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant)),
    chatId: room.id,
    kind: "human",
    userId: member.userId,
    role: "member",
    joinedAt: clock.now(),
    joinSeq: 0,
  });
  await expect(access.resolveRoomRunAs(outsider, room.id, subject.id)).rejects.toMatchObject({ name: "DomainNotFoundError" });
  expect(resolveChatHostUserId).not.toHaveBeenCalled();
  await expect(access.resolveRoomRunAs(member, room.id, subject.id)).rejects.toMatchObject({ name: "DomainNotFoundError" });
  expect(resolveHostPrincipal).not.toHaveBeenCalled();
  expect(await access.resolveRoomRunAs(host, room.id, subject.id)).toBe(host);
  await db.insert(chatParticipants).values({
    id: typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant)),
    chatId: room.id,
    kind: "character",
    characterId: subject.id,
    role: "member",
    joinedAt: clock.now(),
    joinSeq: 0,
  });
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
    authConfig: { ...authConfigFromEnv(), mode: "forward-header", fallback: "deny" },
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

test("only host or PRESENT owner assets reach byte processing; conversion remains deferred with caller quality and signal", async ({
  harness,
  db,
  services,
  ids,
  clock,
}) => {
  const room = await seedChat(db);
  const hostRow = await seedUser(db, { role: "admin" });
  await db.insert(chatParticipants).values({
    id: typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant)),
    chatId: room.id,
    kind: "human",
    userId: hostRow.id,
    role: "host",
    joinedAt: clock.now(),
    joinSeq: 0,
  });
  const hostId = hostRow.id;
  const member = await seedUser(db);
  await db.insert(chatParticipants).values({
    id: typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant)),
    chatId: room.id,
    kind: "human",
    userId: member.id,
    role: "member",
    joinedAt: clock.now(),
    joinSeq: 0,
  });
  const bytes = new Uint8Array([9, 8, 7]);
  const asset = await services.assets.store({ principal: await principal(harness, member.id), bytes, kind: "attachment", mime: "video/webm" });
  // The member's own attachment link places the clip in the room; this case pins presence and deferral.
  const attachedIn = await seedMessage(db, { chatId: room.id, seq: 1, role: "user", authorUserId: member.id, content: `![clip](asset:${asset.assetId})` });
  await db.insert(messageAssets).values({
    id: typeIdSchema(ID_PREFIX.messageAsset).parse(ids.next(ID_PREFIX.messageAsset)),
    messageId: attachedIn.id,
    assetId: asset.assetId,
    origin: "attached",
    createdAt: clock.now(),
  });
  const prepareVideo = vi.fn<ResolveMediaRefDeps["mediaProcessing"]["prepareVideo"]>(() => Promise.resolve(bytes));
  const read = vi.spyOn(services.assets, "loadAssetBytes");
  let forbidden = false;
  const resolve = createResolveMediaRef({
    db: databaseHandle(db),
    assets: services.assets,
    mediaProcessing: { frameCount: () => Promise.resolve(1), prepareVideo },
    forbidExternalMedia: () => forbidden,
  });
  const signal = new AbortController().signal;
  const resolved = await resolve({
    ownerId: hostId,
    chatId: room.id,
    ref: { kind: "asset", assetId: asset.assetId },
    quality: { ...DEFAULT_ATTACHMENT_QUALITY, videoMaxResolution: "original" },
    signal,
  });
  expect(resolved?.media).toBe("video");
  expect(prepareVideo).not.toHaveBeenCalled();
  if (resolved === null || typeof resolved.url !== "function") {
    throw new Error("expected deferred conversion");
  }
  expect(await resolved.url()).toBe(`data:video/webm;base64,${Buffer.from(bytes).toString("base64")}`);
  expect(prepareVideo).toHaveBeenCalledWith(expect.any(Uint8Array), "video/webm", "original", { signal });
  expect(Array.from(prepareVideo.mock.calls[0]?.[0] ?? [])).toEqual(Array.from(bytes));
  await db
    .update(chatParticipants)
    .set({ leftSeq: 3 })
    .where(and(eq(chatParticipants.chatId, room.id), eq(chatParticipants.userId, member.id)));
  read.mockClear();
  const refused = await resolve({ ownerId: hostId, chatId: room.id, ref: { kind: "asset", assetId: asset.assetId } });
  let emitted: string | null = null;
  if (refused !== null) {
    emitted = typeof refused.url === "function" ? await refused.url() : refused.url;
  }
  expect(emitted).toBeNull();
  expect(prepareVideo).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
  expect(await resolve({ ownerId: member.id, chatId: room.id, ref: { kind: "asset", assetId: asset.assetId } })).not.toBeNull();
  forbidden = true;
  expect(await resolve({ ownerId: hostId, chatId: room.id, ref: { kind: "external", url: "https://cdn.example/image" } })).toBeNull();
  forbidden = false;
  expect(await resolve({ ownerId: hostId, chatId: room.id, ref: { kind: "external", url: "https://cdn.example/image" } })).toEqual({
    media: "image",
    url: "https://cdn.example/image",
  });
});

test("a present member's picture the room never placed reads no bytes, while an inline-reply link places the host's", async ({
  harness,
  db,
  services,
  ids,
  clock,
}) => {
  const room = await seedChat(db);
  const host = await seedUser(db);
  const member = await seedUser(db);
  await db.insert(chatParticipants).values(
    [host, member].map((user, index) => ({
      id: typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant)),
      chatId: room.id,
      kind: "human" as const,
      userId: user.id,
      role: index === 0 ? ("host" as const) : ("member" as const),
      joinedAt: clock.now(),
      joinSeq: 0,
    })),
  );
  const picture = (owner: typeof host): Promise<{ readonly assetId: AssetId }> =>
    principal(harness, owner.id).then((caller) =>
      services.assets.store({
        principal: caller,
        bytes: makeAssetBytes(typeIdSchema(ID_PREFIX.asset).parse(ids.next(ID_PREFIX.asset))),
        kind: "attachment",
        mime: PNG,
      }),
    );
  const membersPicture = await picture(member);
  const drawn = await picture(host);
  const reply = await seedMessage(db, { chatId: room.id, seq: 1, content: `![drawn](asset:${drawn.assetId})` });
  await db.insert(messageAssets).values({
    id: typeIdSchema(ID_PREFIX.messageAsset).parse(ids.next(ID_PREFIX.messageAsset)),
    messageId: reply.id,
    assetId: drawn.assetId,
    origin: INLINE_REPLY_ORIGIN,
    createdAt: clock.now(),
  });
  const read = vi.spyOn(services.assets, "loadAssetBytes");
  const resolve = createResolveMediaRef({
    db: databaseHandle(db),
    assets: services.assets,
    mediaProcessing: { frameCount: () => Promise.resolve(1), prepareVideo: () => Promise.reject(new Error("a still image never prepares motion")) },
    forbidExternalMedia: () => false,
  });

  expect(await resolve({ ownerId: host.id, chatId: room.id, ref: { kind: "asset", assetId: membersPicture.assetId } })).toBeNull();
  expect(read).not.toHaveBeenCalled();
  expect((await resolve({ ownerId: host.id, chatId: room.id, ref: { kind: "asset", assetId: drawn.assetId } }))?.media).toBe("image");
  expect(read).toHaveBeenCalledExactlyOnceWith(drawn.assetId);
});
