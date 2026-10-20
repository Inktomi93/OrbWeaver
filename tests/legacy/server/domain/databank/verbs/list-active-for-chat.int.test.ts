// verb: listActiveForChat — the documents active for a chat's prompts (D85 membership-widened), member-readable.
// Load-bearing: the member gate (a non-member is rejected by the injected guard); the membership union (every
// present member's global docs ∪ the chat-attached docs); the HOST sees host-hidden documents FLAGGED to govern
// them, while a MEMBER's payload is filtered to the visible set (a member never learns a hidden document's name).
// @subject packages/server/src/domain/databank/verbs/list-active-for-chat.ts

import { chatParticipants, chats } from "@orb/db";
import type { ChatId, DocumentId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { makeDatabankHarness, principalFor, seedCharacter, seedChat, seedChatHost, seedRosterCharacter, seedUser } from "../_support.ts";

async function hideDocuments(db: Awaited<ReturnType<typeof freshDb>>, chatId: ChatId, hidden: DocumentId[]): Promise<void> {
  await db
    .update(chats)
    .set({ metadata: { databankVisibility: { hidden } } })
    .where(eq(chats.id, chatId));
}

test("D85: returns the membership union (every member's attached globals + chat-attached) for any member", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const host = await seedUser(db, { handle: castId<Handle>("host") });
  const member = await seedUser(db, { handle: castId<Handle>("member") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, host, "host");
  await seedChatHost(db, chatId, member, "member");

  const hostGlobal = await h.service.createFromText({ principal: await principalFor(db, host), name: "hg.md", text: "host global canon" });
  const hostChat = await h.service.createFromText({ principal: await principalFor(db, host), name: "hc.md", text: "host chat canon" });
  const memberGlobal = await h.service.createFromText({ principal: await principalFor(db, member), name: "mg.md", text: "member global canon" });
  await h.service.attachGlobal({ principal: await principalFor(db, host), documentId: hostGlobal.document.id });
  await h.service.attachToChat({ principal: await principalFor(db, host), documentId: hostChat.document.id, chatId });
  await h.service.attachGlobal({ principal: await principalFor(db, member), documentId: memberGlobal.document.id });

  // A member now SEES every member's attached document (the widening), each flagged not-hidden.
  const active = await h.service.listActiveForChat({ principal: await principalFor(db, member), chatId });
  expect(active.map((d) => d.id).sort()).toEqual([hostGlobal.document.id, hostChat.document.id, memberGlobal.document.id].sort());
  expect(active.every((d) => d.hidden === false)).toBe(true);
});

test("D85: the host sees a hidden document FLAGGED; a member never receives it (name-privacy filter)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const host = await seedUser(db, { handle: castId<Handle>("host") });
  const member = await seedUser(db, { handle: castId<Handle>("member") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, host, "host");
  await seedChatHost(db, chatId, member, "member");

  const hostGlobal = await h.service.createFromText({ principal: await principalFor(db, host), name: "hg.md", text: "host global" });
  const memberGlobal = await h.service.createFromText({ principal: await principalFor(db, member), name: "mg.md", text: "member global" });
  await h.service.attachGlobal({ principal: await principalFor(db, host), documentId: hostGlobal.document.id });
  await h.service.attachGlobal({ principal: await principalFor(db, member), documentId: memberGlobal.document.id });
  await hideDocuments(db, chatId, [memberGlobal.document.id]);

  // The host governs it: the hidden doc is present with hidden=true; the visible one is hidden=false.
  const hostView = await h.service.listActiveForChat({ principal: await principalFor(db, host), chatId });
  const hostHidden = hostView.find((d) => d.id === memberGlobal.document.id);
  expect(hostHidden?.hidden).toBe(true);
  expect(hostView.find((d) => d.id === hostGlobal.document.id)?.hidden).toBe(false);

  // The member never receives the host-hidden document at all — its name never leaks to them.
  const memberView = await h.service.listActiveForChat({ principal: await principalFor(db, member), chatId });
  expect(memberView.map((d) => d.id)).not.toContain(memberGlobal.document.id);
  expect(memberView.map((d) => d.id)).toContain(hostGlobal.document.id);
  expect(memberView.every((d) => d.hidden === false)).toBe(true);
});

// D-2 — the per-row PROVENANCE the rack renders as its source chips, and the datum that tells a
// detachable row (chat-attached: the host owns that junction) from one the host may only HIDE. The three
// junction reads already existed; this pins that their answer survives to the panel instead of collapsing.
test("D-2: each row carries the junction(s) crediting it — global · chat · character, several at once", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const host = await seedUser(db, { handle: castId<Handle>("host") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, host, "host");
  const characterId = await seedCharacter(db, host, { id: "character_aveline", name: "Aveline" });
  await seedRosterCharacter(db, chatId, characterId);

  const globalDoc = await h.service.createFromText({ principal: await principalFor(db, host), name: "g.md", text: "global canon" });
  const chatDoc = await h.service.createFromText({ principal: await principalFor(db, host), name: "c.md", text: "chat canon" });
  const charDoc = await h.service.createFromText({ principal: await principalFor(db, host), name: "ch.md", text: "character canon" });
  const bothDoc = await h.service.createFromText({ principal: await principalFor(db, host), name: "b.md", text: "both canon" });
  await h.service.attachGlobal({ principal: await principalFor(db, host), documentId: globalDoc.document.id });
  await h.service.attachToChat({ principal: await principalFor(db, host), documentId: chatDoc.document.id, chatId });
  await h.service.attachToCharacter({ principal: await principalFor(db, host), documentId: charDoc.document.id, characterId });
  // Credited TWICE — a global document the host also pinned to this room. The chip row must say both, and
  // the host must still be offered the detach (the `chat` junction is theirs to cut).
  await h.service.attachGlobal({ principal: await principalFor(db, host), documentId: bothDoc.document.id });
  await h.service.attachToChat({ principal: await principalFor(db, host), documentId: bothDoc.document.id, chatId });

  const active = await h.service.listActiveForChat({ principal: await principalFor(db, host), chatId });
  const sourcesOf = (id: DocumentId): readonly string[] => active.find((d) => d.id === id)?.sources ?? [];
  expect(sourcesOf(globalDoc.document.id)).toEqual(["global"]);
  expect(sourcesOf(chatDoc.document.id)).toEqual(["chat"]);
  expect(sourcesOf(charDoc.document.id)).toEqual(["character"]);
  expect(sourcesOf(bothDoc.document.id)).toEqual(["global", "chat"]);
});

// The host view belongs to the room's PRESENT host: a departed former host reads like any member (the member gate
// is the guard's job, so the harness lets them through to isolate the host read).
test("a departed former host gets the member view; the present host governs the hidden set", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const former = await seedUser(db, { handle: castId<Handle>("former") });
  const current = await seedUser(db, { handle: castId<Handle>("current") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, former, "host");
  await db.update(chatParticipants).set({ leftSeq: 1 }).where(eq(chatParticipants.chatId, chatId));
  await seedChatHost(db, chatId, current, "host");

  const hiddenDoc = await h.service.createFromText({ principal: await principalFor(db, current), name: "h.md", text: "hidden canon" });
  await h.service.attachToChat({ principal: await principalFor(db, current), documentId: hiddenDoc.document.id, chatId });
  await hideDocuments(db, chatId, [hiddenDoc.document.id]);

  expect((await h.service.listActiveForChat({ principal: await principalFor(db, current), chatId })).map((d) => [d.id, d.hidden])).toEqual([
    [hiddenDoc.document.id, true],
  ]);
  expect(await h.service.listActiveForChat({ principal: await principalFor(db, former), chatId })).toEqual([]);
});

test("a non-member is rejected by the injected member guard", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { ensureChatMember: () => Promise.reject(new Error("not a member")) });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const chatId = await seedChat(db, "chat_room");

  await expect(h.service.listActiveForChat({ principal: await principalFor(db, stranger), chatId })).rejects.toThrow("not a member");
});
