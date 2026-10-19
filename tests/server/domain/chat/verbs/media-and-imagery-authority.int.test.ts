// @subject packages/server/src/entry/compose/imagery.ts
import { databaseHandle } from "@orb/db/wiring-driver";
import "@orb/testkit/node/composed-real.ts";
import { INLINE_REPLY_ORIGIN } from "@orb/contracts/chat";
import { DEFAULT_ATTACHMENT_QUALITY } from "@orb/contracts/inference";
import { chatParticipants, messageAssets } from "@orb/db";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { isAdmin, isOwner } from "@orb/server/domain/admin";
import type { ImageryRoomAccessDeps, ResolveMediaRefDeps } from "@orb/server/domain/chat";
import {
  createImageryRoomAccess,
  createResolveMediaRef,
  createResolveViewerVisibility,
  createVisibleExtractQuiet,
  isCharacterSeated,
  loadPresentHostUserId,
} from "@orb/server/domain/chat";
import { makeAssetBytes } from "@orb/testkit/node/factories/asset.ts";
import { seedCharacter } from "@orb/testkit/node/factories/character.ts";
import { seedChat } from "@orb/testkit/node/factories/chat.ts";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { makeFakeRoleClients } from "@orb/testkit/node/factories/role-clients.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
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

test("quiet extraction preserves the caller floor and summary strip while the actual supplied host Principal reads the card", async ({
  harness,
  db,
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
  const host = await principal(harness, hostId);
  const member = await principal(harness, (await seedUser(db)).id);
  const subject = await seedCharacter(db, { ownerId: hostId });
  await db.insert(chatParticipants).values({
    id: typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant)),
    chatId: room.id,
    kind: "human",
    userId: member.userId,
    role: "member",
    joinedAt: clock.now(),
    joinSeq: 2,
    joinHistoryVisibility: "from-join",
  });
  await seedMessage(db, { chatId: room.id, seq: 1, content: "prejoin-secret" });
  await seedMessage(db, { chatId: room.id, seq: 2, content: 'visible-scene <lie truth="hidden-scene"/>' });
  const summarize = vi.fn(makeFakeRoleClients().summarize);
  const roleClientsFor = vi.fn(() => Promise.resolve({ summarize }));
  const getCard = vi.fn(() => Promise.resolve(null));
  const resolveHostPrincipal = vi.fn(() => Promise.resolve(host));
  const extract = createVisibleExtractQuiet({
    db: databaseHandle(db),
    now: clock.now,
    roleClientsFor,
    getCard,
    resolveHostPrincipal,
    resolveUtilityPresetParams: () => Promise.resolve(undefined),
    resolveUserMacroDefs: () => Promise.resolve({ preset: [], game: [] }),
    resolveViewerVisibility: createResolveViewerVisibility({ db: databaseHandle(db) }),
  });
  await extract({ caller: member, funderUserId: hostId, chatId: room.id, instruction: "scene", subjectCharacterId: subject.id });
  expect(getCard).toHaveBeenCalledWith({ principal: host, characterId: subject.id });
  expect(roleClientsFor).toHaveBeenCalledWith(hostId);
  expect(summarize.mock.calls[0]?.[0][0]?.userPrompt).toContain("visible-scene");
  expect(summarize.mock.calls[0]?.[0][0]?.userPrompt).not.toContain("prejoin-secret");
  expect(summarize.mock.calls[0]?.[0][0]?.userPrompt).not.toContain("hidden-scene");
  await expect(
    extract({ caller: await principal(harness, (await seedUser(db)).id), funderUserId: hostId, chatId: room.id, instruction: "scene" }),
  ).rejects.toMatchObject({
    name: "DomainNotFoundError",
  });
  expect(getCard).toHaveBeenCalledTimes(1);
  expect(roleClientsFor).toHaveBeenCalledTimes(1);
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
  // The member's own message cites the clip, so the room has placed it; this case pins presence and deferral.
  await seedMessage(db, { chatId: room.id, seq: 1, role: "user", authorUserId: member.id, content: `![clip](asset:${asset.assetId})` });
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
