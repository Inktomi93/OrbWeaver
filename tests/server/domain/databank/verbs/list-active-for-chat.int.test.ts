// verb: listActiveForChat — the documents active for a chat's prompts (D85 membership-widened), member-readable.
// Load-bearing: the member gate (a non-member is rejected by the injected guard); the membership union (every
// present member's global docs ∪ the chat-attached docs); the HOST sees host-hidden documents FLAGGED to govern
// them, while a MEMBER's payload is filtered to the visible set (a member never learns a hidden document's name).

import { chats } from "@orb/db";
import type { ChatId, DocumentId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
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

  const hostGlobal = await h.service.createFromText({ principal: principalFor(host), name: "hg.md", text: "host global canon" });
  const hostChat = await h.service.createFromText({ principal: principalFor(host), name: "hc.md", text: "host chat canon" });
  const memberGlobal = await h.service.createFromText({ principal: principalFor(member), name: "mg.md", text: "member global canon" });
  await h.service.attachGlobal({ principal: principalFor(host), documentId: hostGlobal.document.id });
  await h.service.attachToChat({ principal: principalFor(host), documentId: hostChat.document.id, chatId });
  await h.service.attachGlobal({ principal: principalFor(member), documentId: memberGlobal.document.id });

  // A member now SEES every member's attached document (the widening), each flagged not-hidden.
  const active = await h.service.listActiveForChat({ principal: principalFor(member), chatId });
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

  const hostGlobal = await h.service.createFromText({ principal: principalFor(host), name: "hg.md", text: "host global" });
  const memberGlobal = await h.service.createFromText({ principal: principalFor(member), name: "mg.md", text: "member global" });
  await h.service.attachGlobal({ principal: principalFor(host), documentId: hostGlobal.document.id });
  await h.service.attachGlobal({ principal: principalFor(member), documentId: memberGlobal.document.id });
  await hideDocuments(db, chatId, [memberGlobal.document.id]);

  // The host governs it: the hidden doc is present with hidden=true; the visible one is hidden=false.
  const hostView = await h.service.listActiveForChat({ principal: principalFor(host), chatId });
  const hostHidden = hostView.find((d) => d.id === memberGlobal.document.id);
  expect(hostHidden?.hidden).toBe(true);
  expect(hostView.find((d) => d.id === hostGlobal.document.id)?.hidden).toBe(false);

  // The member never receives the host-hidden document at all — its name never leaks to them.
  const memberView = await h.service.listActiveForChat({ principal: principalFor(member), chatId });
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
  const characterId = await seedCharacter(db, host, { id: "character_azarael", name: "Azarael" });
  await seedRosterCharacter(db, chatId, characterId);

  const globalDoc = await h.service.createFromText({ principal: principalFor(host), name: "g.md", text: "global canon" });
  const chatDoc = await h.service.createFromText({ principal: principalFor(host), name: "c.md", text: "chat canon" });
  const charDoc = await h.service.createFromText({ principal: principalFor(host), name: "ch.md", text: "character canon" });
  const bothDoc = await h.service.createFromText({ principal: principalFor(host), name: "b.md", text: "both canon" });
  await h.service.attachGlobal({ principal: principalFor(host), documentId: globalDoc.document.id });
  await h.service.attachToChat({ principal: principalFor(host), documentId: chatDoc.document.id, chatId });
  await h.service.attachToCharacter({ principal: principalFor(host), documentId: charDoc.document.id, characterId });
  // Credited TWICE — a global document the host also pinned to this room. The chip row must say both, and
  // the host must still be offered the detach (the `chat` junction is theirs to cut).
  await h.service.attachGlobal({ principal: principalFor(host), documentId: bothDoc.document.id });
  await h.service.attachToChat({ principal: principalFor(host), documentId: bothDoc.document.id, chatId });

  const active = await h.service.listActiveForChat({ principal: principalFor(host), chatId });
  const sourcesOf = (id: DocumentId): readonly string[] => active.find((d) => d.id === id)?.sources ?? [];
  expect(sourcesOf(globalDoc.document.id)).toEqual(["global"]);
  expect(sourcesOf(chatDoc.document.id)).toEqual(["chat"]);
  expect(sourcesOf(charDoc.document.id)).toEqual(["character"]);
  expect(sourcesOf(bothDoc.document.id)).toEqual(["global", "chat"]);
});

test("a non-member is rejected by the injected member guard", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { ensureChatMember: () => Promise.reject(new Error("not a member")) });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const chatId = await seedChat(db, "chat_room");

  await expect(h.service.listActiveForChat({ principal: principalFor(stranger), chatId })).rejects.toThrow("not a member");
});
