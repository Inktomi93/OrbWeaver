// persistence: resolveActiveDocumentIds — the ONE junction-union home (databank-design/05 §3.2), D85
// MEMBERSHIP-WIDENED. The flagship no-leak assertion (gate 8), widened to two members BOTH attaching:
//   (a) an attached member's docs DO surface for every member's turn (the membership union — global widened
//       from host-only to every present member);
//   (b) a member's PRIVATE (unattached) docs NEVER surface — widening credits only ATTACHED documents;
//   (c) a host-EXCLUDED document (the per-document visibility override on chats.metadata) is subtracted from
//       the retrieval set;
//   (d) a LEFT member's (leftSeq non-null) global docs stop crediting the room.
// A `{ownerId}` scope stays the whole personal bank (junctions only scope chat retrieval, not a personal search).

import { chatParticipants, chats } from "@orb/db";
import type { ChatId, DocumentId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveActiveDocumentIds } from "@orb/server/domain/databank";
import { and, eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedCharacter, seedChat, seedChatHost, seedRosterCharacter, seedUser } from "../_support.ts";

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
