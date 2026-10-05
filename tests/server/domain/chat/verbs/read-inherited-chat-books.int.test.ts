// Composed world-book rack: real membership, owned-card resolution, runtime scope pool and world-info verb.

import { createInvalidation, createTrpcClient, createTrpcProxy } from "@orb/client/data";
import { __resetBusDupBursts } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import { chatBookViewSchema } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, chatBooks, chatParticipants, chats, globalBooks, personaBooks, personas, users, worldBooks, worldEntries } from "@orb/db";
import type { ChatParticipantId, Handle, PersonaId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { can } from "@orb/server/domain/admin";
import { createCharacterService } from "@orb/server/domain/character";
import { createReadInheritedChatBooks, requireHost, requireParticipant } from "@orb/server/domain/chat";
import { createPersonaService } from "@orb/server/domain/persona";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { createDeleteReachCapture, createRoomEntityFan } from "@orb/server/entry/compose";
import { QueryClient } from "@tanstack/react-query";
import { eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { createSeededIds } from "../../../../support/ids.ts";
import { makeHarness as characterHarness } from "../../character/_support.ts";
import { makeHarness as personaHarness } from "../../persona/_support.ts";
import { makeHarness, principal, seedChat, seedUser } from "../../world-info/_support.ts";

const ids = createSeededIds();

async function book(db: Db, ownerId: UserId, key: string): Promise<WorldBookId> {
  const id = castId<WorldBookId>(ids.next(ID_PREFIX.worldBook));
  await db.insert(worldBooks).values({ id, ownerId, name: key, description: `${key} private memo`, createdAt: FROZEN_AT_MS });
  await db
    .insert(worldEntries)
    .values({ id: castId<WorldEntryId>(`worldentry_${key}`), worldBookId: id, title: key, content: `${key} lore`, createdAt: FROZEN_AT_MS });
  return id;
}

interface WorldBookFixture {
  readonly db: Db;
  readonly host: UserId;
  readonly member: UserId;
  readonly stranger: UserId;
  readonly chatId: import("@orb/kit/ids").ChatId;
  readonly personaId: PersonaId;
  readonly card: Awaited<ReturnType<ReturnType<typeof createCharacterService>["create"]>>;
  readonly svc: ReturnType<typeof createWorldInfoService>;
  readonly readInheritedChatBooks: ReturnType<typeof createReadInheritedChatBooks>;
  readonly fans: LiveOnlyChatBusEvent[];
  readonly pendingFans: Promise<void>[];
  readonly queryClient: QueryClient;
  readonly rackKey: ReturnType<ReturnType<typeof createTrpcProxy>["worldInfo"]["listForChat"]["queryKey"]>;
  readonly character: ReturnType<typeof createCharacterService>;
  readonly persona: ReturnType<typeof createPersonaService>;
}

async function setup(suppliedDb?: Db): Promise<WorldBookFixture> {
  __resetBusDupBursts();
  const db = suppliedDb ?? (await freshDb());
  const host = await seedUser(db, { handle: castId<Handle>("host") });
  const member = await seedUser(db, { handle: castId<Handle>("member") });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const chatId = await seedChat(db);
  const personaId = castId<PersonaId>("persona_member");
  await db
    .insert(personas)
    .values({ id: personaId, ownerId: member, name: "Member persona", description: "Consented persona", createdAt: FROZEN_AT_MS, updatedAt: FROZEN_AT_MS });
  await db.insert(chatParticipants).values([
    { id: castId<ChatParticipantId>("chatpart_host"), chatId, kind: "human", userId: host, role: "host", joinSeq: 0 },
    { id: castId<ChatParticipantId>("chatpart_member"), chatId, kind: "human", userId: member, role: "member", activePersonaId: personaId, joinSeq: 0 },
  ]);
  const fans: LiveOnlyChatBusEvent[] = [];
  const pendingFans: Promise<void>[] = [];
  const queryClient = new QueryClient();
  const trpc = createTrpcProxy(createTrpcClient("http://localhost/api/trpc"), queryClient);
  const invalidation = createInvalidation({ queryClient, trpc });
  const rackKey = trpc.worldInfo.listForChat.queryKey({ chatId, includeInherited: true });
  const emitRoom = (event: LiveOnlyChatBusEvent): void => {
    fans.push(event);
    invalidation.invalidate(event);
  };
  const fan = createRoomEntityFan(db, emitRoom);
  const emit: Parameters<typeof createWorldInfoService>[0]["emit"] = (event) => {
    pendingFans.push(fan(event));
  };
  const character = createCharacterService({ ...characterHarness(db).ctx, emit });
  const card = await character.create({
    principal: principal(host),
    input: createCharacterSchema.parse({ name: "Aveline", handle: "aveline", description: "Warden" }),
  });
  await db
    .insert(chatParticipants)
    .values({ id: castId<ChatParticipantId>("chatpart_card"), chatId, kind: "character", characterId: card.id, role: "member", joinSeq: 0 });
  const readInheritedChatBooks = createReadInheritedChatBooks({
    db,
    can,
    getCard: ({ ownerId, characterId }) => character.getCard({ principal: principal(ownerId), characterId }),
    resolveUserEnabled: async (id) => (await db.select({ enabled: users.enabled }).from(users).where(eq(users.id, id)))[0]?.enabled ?? false,
  });
  const ctx = makeHarness(db, {
    requireChatHost: (actor, id) => requireHost({ db, can }, actor, id).then((): void => undefined),
    requireChatMember: (actor, id) => requireParticipant({ db, can }, actor, id).then((): void => undefined),
    readInheritedChatBooks,
    captureRoomReachForDelete: createDeleteReachCapture(db, emitRoom)["world-info"],
  }).ctx;
  const svc = createWorldInfoService({ ...ctx, emit });
  const persona = createPersonaService(personaHarness(db, { emit }).ctx);
  return { db, host, member, stranger, chatId, personaId, card, svc, readInheritedChatBooks, fans, pendingFans, queryClient, rackKey, character, persona };
}

test("owned global/character and consented member-persona sources precede attached books; members see only attachments", async () => {
  const f = await setup();
  const global = await book(f.db, f.host, "Global");
  const character = await book(f.db, f.host, "Character");
  const persona = await book(f.db, f.member, "Persona");
  const attached = await book(f.db, f.host, "Attached");
  await f.db.insert(globalBooks).values({ worldBookId: global, createdAt: FROZEN_AT_MS });
  await f.db.insert(characterBooks).values({ characterId: f.card.id, worldBookId: character, role: "primary", createdAt: FROZEN_AT_MS });
  await f.db.insert(personaBooks).values({ personaId: f.personaId, worldBookId: persona, createdAt: FROZEN_AT_MS });
  await f.db.insert(chatBooks).values({ chatId: f.chatId, worldBookId: attached, createdAt: FROZEN_AT_MS });
  const hostView = await f.svc.listForChat({ principal: principal(f.host), chatId: f.chatId, includeInherited: true });
  expect(hostView.map((row) => row.id)).toEqual([global, character, persona, attached]);
  expect(hostView.map((row) => row.inherited)).toEqual([
    { source: "global", name: null },
    { source: "character", name: "Aveline" },
    { source: "persona", name: "Member persona" },
    undefined,
  ]);
  expect(hostView[2]?.description).toBeNull();
  for (const row of hostView) {
    expect(chatBookViewSchema.parse(row)).toEqual(row);
  }
  expect((await f.svc.listForChat({ principal: principal(f.member), chatId: f.chatId, includeInherited: true })).map((row) => row.id)).toEqual([attached]);
  await expect(f.svc.listForChat({ principal: principal(f.stranger), chatId: f.chatId, includeInherited: true })).rejects.toThrow();
  // Inherited is not chat consent. The canonical host attach still creates the chat junction.
  await f.svc.attachToChat({ principal: principal(f.host), chatId: f.chatId, bookId: global });
  expect(
    (await f.svc.listForChat({ principal: principal(f.host), chatId: f.chatId, includeInherited: true }))
      .filter((row) => row.id === global)
      .map((row) => row.inherited?.source ?? "chat"),
  ).toEqual(["global", "chat"]);
});

test("foreign scope books, absent/disabled persona owners and the memberPersonaLore switch never enter inherited metadata", async () => {
  const f = await setup();
  const foreign = await book(f.db, f.stranger, "Foreign");
  const ownedPersona = await book(f.db, f.member, "Member");
  await f.db.insert(globalBooks).values({ worldBookId: foreign, createdAt: FROZEN_AT_MS });
  await f.db.insert(characterBooks).values({ characterId: f.card.id, worldBookId: foreign, role: "auxiliary", createdAt: FROZEN_AT_MS });
  await f.db.insert(personaBooks).values([
    { personaId: f.personaId, worldBookId: foreign, createdAt: FROZEN_AT_MS },
    { personaId: f.personaId, worldBookId: ownedPersona, createdAt: FROZEN_AT_MS },
  ]);
  expect((await f.readInheritedChatBooks(principal(f.host), f.chatId)).map((row) => row.id)).toEqual([ownedPersona]);
  await f.db.update(users).set({ enabled: false }).where(eq(users.id, f.member));
  expect(await f.readInheritedChatBooks(principal(f.host), f.chatId)).toEqual([]);
  await f.db.update(users).set({ enabled: true }).where(eq(users.id, f.member));
  await f.db.update(chatParticipants).set({ leftSeq: 3 }).where(eq(chatParticipants.userId, f.member));
  expect(await f.readInheritedChatBooks(principal(f.host), f.chatId)).toEqual([]);
  await f.db.update(chatParticipants).set({ leftSeq: null }).where(eq(chatParticipants.userId, f.member));
  await f.svc.listForChat({ principal: principal(f.host), chatId: f.chatId });
  await f.db
    .update(chats)
    .set({ metadata: { memberPersonaLore: false } })
    .where(eq(chats.id, f.chatId));
  expect(await f.readInheritedChatBooks(principal(f.host), f.chatId)).toEqual([]);
});

test("member persona scope changes fan the host's rack on both attach and removal", async () => {
  const f = await setup();
  const id = await book(f.db, f.member, "Changing member book");
  f.queryClient.setQueryData(f.rackKey, []);
  await f.svc.attachToPersona({ principal: principal(f.member), personaId: f.personaId, bookId: id });
  await Promise.all(f.pendingFans);
  expect(f.fans).toEqual([{ type: "roomEntityChanged", chatId: f.chatId, entity: "world-info" }]);
  expect(f.queryClient.getQueryCache().find({ queryKey: f.rackKey })?.state.isInvalidated).toBe(true);
  expect((await f.readInheritedChatBooks(principal(f.host), f.chatId)).map((row) => row.id)).toEqual([id]);
  f.fans.length = 0;
  f.queryClient.setQueryData(f.rackKey, []);
  await f.svc.detachFromPersona({ principal: principal(f.member), personaId: f.personaId, bookId: id });
  expect(f.fans).toEqual([{ type: "roomEntityChanged", chatId: f.chatId, entity: "world-info" }]);
  expect(f.queryClient.getQueryCache().find({ queryKey: f.rackKey })?.state.isInvalidated).toBe(true);
  expect(await f.readInheritedChatBooks(principal(f.host), f.chatId)).toEqual([]);
});

test("actual character/persona rename events invalidate the host's inherited source labels", async () => {
  const f = await setup();
  const charBook = await book(f.db, f.host, "Card book");
  const personaBook = await book(f.db, f.member, "Persona book");
  await f.svc.attachToCharacter({ principal: principal(f.host), characterId: f.card.id, bookId: charBook, role: "auxiliary" });
  await f.svc.attachToPersona({ principal: principal(f.member), personaId: f.personaId, bookId: personaBook });
  await Promise.all(f.pendingFans);
  for (const rename of [
    (): ReturnType<typeof f.character.update> => f.character.update({ principal: principal(f.host), characterId: f.card.id, input: { name: "Renamed card" } }),
    (): ReturnType<typeof f.persona.update> => f.persona.update({ principal: principal(f.member), personaId: f.personaId, input: { name: "Renamed persona" } }),
  ]) {
    __resetBusDupBursts();
    f.queryClient.setQueryData(f.rackKey, []);
    await rename();
    await Promise.all(f.pendingFans);
    expect(f.queryClient.getQueryCache().find({ queryKey: f.rackKey })?.state.isInvalidated).toBe(true);
  }
  expect((await f.readInheritedChatBooks(principal(f.host), f.chatId)).map((row) => row.inherited?.name)).toEqual(["Renamed card", "Renamed persona"]);
});

test("host standing lost while owned-card resolution awaits strips inherited headers before returning", async () => {
  const held = await freshHeldDb();
  const f = await setup(held.db);
  const id = await book(f.db, f.host, "Former host private library");
  await f.db.insert(globalBooks).values({ worldBookId: id, createdAt: FROZEN_AT_MS });
  const gate = held.hold(/from "characters"/u);
  const pending = f.readInheritedChatBooks(principal(f.host), f.chatId);
  await gate.reached;
  await f.db.update(chatParticipants).set({ role: "member" }).where(eq(chatParticipants.userId, f.host));
  gate.release();
  expect(await pending).toEqual([]);
});
