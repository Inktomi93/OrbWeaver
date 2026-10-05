// persistence: resolveActiveDocumentIds — the ONE junction-union home, D85
// MEMBERSHIP-WIDENED. The flagship no-leak assertion (gate 8), widened to two members BOTH attaching:
//   (a) an attached member's docs DO surface for every member's turn (the membership union — global widened
//       from host-only to every present member);
//   (b) a member's PRIVATE (unattached) docs NEVER surface — widening credits only ATTACHED documents;
//   (c) a host-EXCLUDED document (the per-document visibility override on chats.metadata) is subtracted from
//       the retrieval set;
//   (d) a LEFT member's (leftSeq non-null) global docs stop crediting the room.
// A `{ownerId}` scope stays the whole personal bank (junctions only scope chat retrieval, not a personal search).

import { characterDocuments, characters, chatDocuments, chatParticipants, chats, documents, globalDocuments } from "@orb/db";
import type { ChatId, DocumentId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { can } from "@orb/server/domain/admin";
import { requireHost } from "@orb/server/domain/chat";
import { resolveActiveDocumentIds } from "@orb/server/domain/databank";
import { and, eq } from "drizzle-orm";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedCharacter, seedChat, seedChatHost, seedRosterCharacter, seedUser } from "../_support.ts";

for (const door of ["upload", "paste", "link"] as const) {
  for (const scope of ["global", "character", "chat"] as const) {
    test(`${door} atomically credits the selected ${scope} destination and duplicate retries retain its other attachments`, async () => {
      const db = await freshDb();
      const owner = await seedUser(db, { handle: castId<Handle>("destination_owner") });
      const characterId = await seedCharacter(db, owner, { id: "character_destination", name: "Destination" });
      const selectedChat = await seedChat(db, "selected");
      const characterChat = await seedChat(db, "character");
      const otherChat = await seedChat(db, "other");
      for (const chatId of [selectedChat, characterChat, otherChat]) {
        await seedChatHost(db, chatId, owner);
      }
      await seedRosterCharacter(db, characterChat, characterId);
      const h = makeDatabankHarness(db, { ensureChatHost: (principal, chatId) => requireHost({ db, can }, principal, chatId).then((): void => undefined) });
      h.fetchUrl.mockResolvedValue(new TextEncoder().encode("Destination notes"));
      const destinations = { global: { kind: "global" }, character: { kind: "character", characterId }, chat: { kind: "chat", chatId: selectedChat } } as const;
      const common = { principal: principalFor(owner), destination: destinations[scope] };
      const ingesters = {
        upload: () => h.service.upload({ ...common, bytes: new TextEncoder().encode("Destination notes"), name: "notes.md", mime: "text/markdown" }),
        paste: () => h.service.createFromText({ ...common, name: "Notes", text: "Destination notes" }),
        link: () => h.service.scrapeWeb({ ...common, url: "https://notes.test/notes" }),
      };
      const result = await ingesters[door]();
      const expected = { global: [selectedChat, characterChat, otherChat], character: [characterChat], chat: [selectedChat] }[scope];
      for (const chatId of [selectedChat, characterChat, otherChat]) {
        expect(await resolveActiveDocumentIds(db, { chatId })).toEqual(expected.includes(chatId) ? [result.document.id] : []);
      }
      expect(await resolveActiveDocumentIds(db, { ownerId: owner })).toEqual([result.document.id]);
      const duplicate = await ingesters[door]();
      expect(duplicate).toMatchObject({ document: { id: result.document.id }, outcome: "duplicate", ingest: "skipped" });
      expect(await db.select().from(documents)).toHaveLength(1);
      const counts = {
        global: await db.select().from(globalDocuments),
        character: await db.select().from(characterDocuments),
        chat: await db.select().from(chatDocuments),
      };
      expect(counts[scope]).toHaveLength(1);
      if (scope === "global") {
        await h.service.detachGlobal({ principal: principalFor(owner), documentId: result.document.id });
      } else {
        const global = { ...common, destination: destinations.global, name: "Notes", text: "Destination notes" };
        await h.service.createFromText(global);
      }
      expect(await resolveActiveDocumentIds(db, { chatId: otherChat })).toEqual(scope === "global" ? [] : [result.document.id]);
      expect(await db.select().from(documents)).toHaveLength(1);
      expect((await db.select().from(globalDocuments)).map((row) => row.documentId)).toEqual(scope === "global" ? [] : [result.document.id]);
    });
  }
}

test("foreign ingestion targets refuse before canon or scope rows are written", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("ingester") });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const characterId = await seedCharacter(db, stranger, { id: "character_foreign", name: "Foreign" });
  const chatId = await seedChat(db, "foreign");
  await seedChatHost(db, chatId, stranger);
  const h = makeDatabankHarness(db, { ensureChatHost: (principal, id) => requireHost({ db, can }, principal, id).then((): void => undefined) });
  for (const destination of [
    { kind: "character", characterId },
    { kind: "chat", chatId },
  ] as const) {
    const params = { principal: principalFor(owner), name: "Private notes", text: "Must not land", destination };
    await expect(h.service.createFromText(params)).rejects.toThrow();
    await expect(
      h.service.upload({
        principal: params.principal,
        destination,
        name: "Private notes",
        bytes: new TextEncoder().encode("Must not land"),
        mime: "text/plain",
      }),
    ).rejects.toThrow();
    await expect(h.service.scrapeWeb({ principal: params.principal, destination, url: "https://example.org/notes" })).rejects.toThrow();
  }
  expect(await db.select().from(documents)).toEqual([]);
  expect(await db.select().from(characterDocuments)).toEqual([]);
  expect(await db.select().from(chatDocuments)).toEqual([]);
  expect(h.enqueueIngest).not.toHaveBeenCalled();
});

test("a target owner change before the ingestion batch cannot leave private canon behind", async () => {
  const held = await freshHeldDb();
  const db = held.db;
  const owner = await seedUser(db, { handle: castId<Handle>("original") });
  const stranger = await seedUser(db, { handle: castId<Handle>("replacement") });
  const characterId = await seedCharacter(db, owner, { id: "character_changes", name: "Changes" });
  const h = makeDatabankHarness(db);
  const gate = held.hold(/insert into "documents"/u);
  const params = { principal: principalFor(owner), name: "Scoped", text: "Canon", destination: { kind: "character", characterId } as const };
  const pending = h.service.createFromText(params);
  const refused = expect(pending).rejects.toThrow();
  await gate.reached;
  await db.update(characters).set({ ownerId: stranger }).where(eq(characters.id, characterId));
  gate.release();
  await refused;
  expect(await db.select().from(documents)).toEqual([]);
  expect(await db.select().from(characterDocuments)).toEqual([]);
});

test("a host demotion before the ingestion batch refuses both canon and room consent", async () => {
  const held = await freshHeldDb();
  const db = held.db;
  const owner = await seedUser(db, { handle: castId<Handle>("original") });
  const chatId = await seedChat(db, "role-change");
  await seedChatHost(db, chatId, owner);
  const h = makeDatabankHarness(db, { ensureChatHost: (actor, id) => requireHost({ db, can }, actor, id).then((): void => undefined) });
  const gate = held.hold(/insert into "documents"/u);
  const pending = h.service.createFromText({ principal: principalFor(owner), name: "Scoped", text: "Canon", destination: { kind: "chat", chatId } });
  const refused = expect(pending).rejects.toThrow();
  await gate.reached;
  await db.update(chatParticipants).set({ role: "member" }).where(eq(chatParticipants.chatId, chatId));
  gate.release();
  await refused;
  expect(await db.select().from(documents)).toEqual([]);
  expect(await db.select().from(chatDocuments)).toEqual([]);
  expect(h.enqueueIngest).not.toHaveBeenCalled();
});

test("simultaneous duplicate ingest creates one canon and retains both explicit consents", async () => {
  const held = await freshHeldDb();
  const db = held.db;
  const owner = await seedUser(db, { handle: castId<Handle>("original") });
  const characterId = await seedCharacter(db, owner, { id: "character_concurrent", name: "Concurrent" });
  const h = makeDatabankHarness(db);
  const gate = held.hold(/insert into "documents"/u, 2);
  const params = { principal: principalFor(owner), name: "Scoped", text: "Shared canon" };
  const first = h.service.createFromText({ ...params, destination: { kind: "global" } });
  const second = h.service.createFromText({ ...params, destination: { kind: "character", characterId } });
  await gate.reached;
  gate.release();
  const results = await Promise.all([first, second]);
  expect(results.map((result) => result.outcome).sort()).toEqual(["created", "duplicate"]);
  expect(results[0]?.document.id).toBe(results[1]?.document.id);
  expect(await db.select().from(documents)).toHaveLength(1);
  expect((await db.select().from(globalDocuments))[0]?.documentId).toBe(results[0]?.document.id);
  expect((await db.select().from(characterDocuments))[0]?.documentId).toBe(results[0]?.document.id);
  expect(h.enqueueIngest).toHaveBeenCalledTimes(1);
});

/** Write the host per-document visibility override directly into chats.metadata (the persistence layer under
 *  test; the host-gated `chat.setChatDocumentVisibility` verb is what writes this in production). */
async function hideDocuments(db: Awaited<ReturnType<typeof freshDb>>, chatId: ChatId, hidden: DocumentId[]): Promise<void> {
  await db
    .update(chats)
    .set({ metadata: { databankVisibility: { hidden } } })
    .where(eq(chats.id, chatId));
}

/** Mark a present human member as LEFT (leftSeq set) — their global docs must drop out of the union. */
async function markMemberLeft(db: Awaited<ReturnType<typeof freshDb>>, chatId: ChatId, userId: UserId, leftSeq: number): Promise<void> {
  await db
    .update(chatParticipants)
    .set({ leftSeq })
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId)));
}

test("D85 gate-8: the membership union credits every ATTACHED member doc; private + hidden + left-member docs never leak", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const host = await seedUser(db, { handle: castId<Handle>("host") });
  const member = await seedUser(db, { handle: castId<Handle>("member") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, host, "host");
  await seedChatHost(db, chatId, member, "member");

  // Host: a global doc, a chat-attached doc, and an UNATTACHED (private) doc.
  const hostGlobal = await h.service.createFromText({ principal: principalFor(host), name: "hg.md", text: "host global" });
  const hostChat = await h.service.createFromText({ principal: principalFor(host), name: "hc.md", text: "host chat" });
  const hostPrivate = await h.service.createFromText({ principal: principalFor(host), name: "hu.md", text: "host private" });
  await h.service.attachGlobal({ principal: principalFor(host), documentId: hostGlobal.document.id });
  await h.service.attachToChat({ principal: principalFor(host), documentId: hostChat.document.id, chatId });

  // Member: a global doc (ATTACHED to global scope → widens in) and an UNATTACHED (private) doc.
  const memberGlobal = await h.service.createFromText({ principal: principalFor(member), name: "mg.md", text: "member global" });
  const memberPrivate = await h.service.createFromText({ principal: principalFor(member), name: "mu.md", text: "member private" });
  await h.service.attachGlobal({ principal: principalFor(member), documentId: memberGlobal.document.id });

  // (a) + (b): the union credits the member's ATTACHED global doc; NO private doc from either member leaks.
  const union = await resolveActiveDocumentIds(db, { chatId });
  expect(union.toSorted()).toEqual([hostGlobal.document.id, hostChat.document.id, memberGlobal.document.id].sort());
  expect(union).not.toContain(hostPrivate.document.id);
  expect(union).not.toContain(memberPrivate.document.id);

  // (c): the host excludes the member's global doc → it drops from RETRIEVAL (widening default-on, override subtracts).
  await hideDocuments(db, chatId, [memberGlobal.document.id]);
  const afterHide = await resolveActiveDocumentIds(db, { chatId });
  expect(afterHide).not.toContain(memberGlobal.document.id);
  expect(afterHide.toSorted()).toEqual([hostGlobal.document.id, hostChat.document.id].sort());

  // (d): the member LEAVES → their global doc stops crediting the room (kind='human' + leftSeq-null filter bites).
  await hideDocuments(db, chatId, []); // clear the override so (d) isolates the leftSeq effect
  await markMemberLeft(db, chatId, member, 7);
  const afterLeave = await resolveActiveDocumentIds(db, { chatId });
  expect(afterLeave).not.toContain(memberGlobal.document.id);
  expect(afterLeave.toSorted()).toEqual([hostGlobal.document.id, hostChat.document.id].sort());

  // Personal search scope = the whole bank (every owned doc, attachment-independent) — unchanged by D85.
  const hostBank = await resolveActiveDocumentIds(db, { ownerId: host });
  expect(hostBank.toSorted()).toEqual([hostGlobal.document.id, hostChat.document.id, hostPrivate.document.id].sort());
  const memberBank = await resolveActiveDocumentIds(db, { ownerId: member });
  expect(memberBank.toSorted()).toEqual([memberGlobal.document.id, memberPrivate.document.id].sort());
});

test("a corrupt databankVisibility blob heals to default-visible (fault-isolated; never hides silently)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const host = await seedUser(db, { handle: castId<Handle>("host") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, host, "host");
  const hg = await h.service.createFromText({ principal: principalFor(host), name: "hg.md", text: "host global" });
  await h.service.attachGlobal({ principal: principalFor(host), documentId: hg.document.id });

  // A garbage sub-blob (wrong shape) must NOT throw and must NOT silently hide — widening is default-on.
  // @orb-waive no-test-fabrication(unknown): deliberately writing a corrupt metadata blob to prove the fault-isolated read heals it. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const corruptShape = { databankVisibility: { hidden: "not-an-array" } } as unknown as never;
  await db.update(chats).set({ metadata: corruptShape }).where(eq(chats.id, chatId));
  expect(await resolveActiveDocumentIds(db, { chatId })).toEqual([hg.document.id]);

  // A totally non-object metadata blob heals the same way.
  // @orb-waive no-test-fabrication(unknown): a non-object metadata column value is exactly the corruption the read must survive. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const corruptScalar = 42 as unknown as never;
  await db.update(chats).set({ metadata: corruptScalar }).where(eq(chats.id, chatId));
  expect(await resolveActiveDocumentIds(db, { chatId })).toEqual([hg.document.id]);
});

test("chat scope unions the docs of PRESENT roster characters; a departed character's docs drop out", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const host = await seedUser(db, { handle: castId<Handle>("host") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, host, "host");

  const present = await seedCharacter(db, host, { id: "character_present", name: "Present" });
  const departed = await seedCharacter(db, host, { id: "character_departed", name: "Departed" });
  await seedRosterCharacter(db, chatId, present);
  await seedRosterCharacter(db, chatId, departed, 5); // left the room at seq 5

  const cp = await h.service.createFromText({ principal: principalFor(host), name: "cp.md", text: "present char doc" });
  const cd = await h.service.createFromText({ principal: principalFor(host), name: "cd.md", text: "departed char doc" });
  await h.service.attachToCharacter({ principal: principalFor(host), documentId: cp.document.id, characterId: present });
  await h.service.attachToCharacter({ principal: principalFor(host), documentId: cd.document.id, characterId: departed });

  const chatScope = await resolveActiveDocumentIds(db, { chatId });
  expect(chatScope).toContain(cp.document.id);
  expect(chatScope).not.toContain(cd.document.id);
});

test("a memberless chat resolves to no global docs, but chat-attached docs still resolve", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const chatId = await seedChat(db, "empty_room");
  const doc = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: doc.document.id, chatId });

  // No present human members ⇒ no global arm; the chat-attached doc still resolves (chat union arm).
  expect(await resolveActiveDocumentIds(db, { chatId })).toEqual([doc.document.id]);
});
