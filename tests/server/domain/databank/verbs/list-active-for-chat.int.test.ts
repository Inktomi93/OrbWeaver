// verb: listActiveForChat — the documents active for a chat's prompts (D85 membership-widened), member-readable.
// Load-bearing: the member gate (a non-member is rejected by the injected guard); the membership union (every
// present member's global docs ∪ the chat-attached docs); the HOST sees host-hidden documents FLAGGED to govern
// them, while a MEMBER's payload is filtered to the visible set (a member never learns a hidden document's name).

import { chats } from "@orb/db";
import type { ChatId, DocumentId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedChat, seedChatHost, seedUser } from "../_support.ts";

async function hideDocuments(db: Awaited<ReturnType<typeof freshDb>>, chatId: ChatId, hidden: DocumentId[]): Promise<void> {
  await db
    .update(chats)
    .set({ metadata: { databankVisibility: { hidden } } })
    .where(eq(chats.id, chatId));
}

test("D85: returns the membership union (every member's attached globals + chat-attached) for any member", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const host = await seedUser(db, { handle: "host" });
  const member = await seedUser(db, { handle: "member" });
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
  const host = await seedUser(db, { handle: "host" });
  const member = await seedUser(db, { handle: "member" });
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

test("a non-member is rejected by the injected member guard", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { ensureChatMember: () => Promise.reject(new Error("not a member")) });
  const stranger = await seedUser(db, { handle: "stranger" });
  const chatId = await seedChat(db, "chat_room");

  await expect(h.service.listActiveForChat({ principal: principalFor(stranger), chatId })).rejects.toThrow("not a member");
});
