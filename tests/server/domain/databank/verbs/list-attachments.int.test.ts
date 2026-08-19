// verb: listAttachments — where an owned document is attached (owner-gated). Returns the global flag + the
// NAMED rooms and characters (#276). A non-owner throws DocumentNotFoundError.
//
// THE TWO SCOPES ARE GATED DIFFERENTLY, and these pins say so:
//   • characters come off databank's own owner-scoped join — the caller owns both sides of that junction;
//   • rooms go through chat's injected `resolveVisibleRooms` and NOTHING else. The harness default THROWS
//     ("not stubbed"), so a verb that stopped consulting chat would fail LOUDLY here rather than quietly
//     answer `[]` — and the leak arm below pins that a room the resolver drops leaves no residue at all.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedChat, seedUser } from "../_support.ts";

const ROOM_AT = 1_700_000_000_000;

test("reports the document's global flag and NAMES the rooms chat says the caller may see", async () => {
  const db = await freshDb();
  const seen: string[][] = [];
  const h = makeDatabankHarness(db, {
    resolveVisibleRooms: (_principal, chatIds) => {
      seen.push([...chatIds]);
      return Promise.resolve(chatIds.map((id) => ({ id, title: "The Long Dark", participantNames: ["Azarael"], at: ROOM_AT })));
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await h.service.attachGlobal({ principal: principalFor(owner), documentId: document.id });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId });

  const view = await h.service.listAttachments({ principal: principalFor(owner), id: document.id });
  expect(view.global).toBe(true);
  expect(view.chats).toEqual([{ id: chatId, title: "The Long Dark", participantNames: ["Azarael"], at: ROOM_AT }]);
  expect(view.characters).toEqual([]);
  // The junction's ids are what got handed to chat — the verb filters nothing itself.
  expect(seen).toEqual([[chatId]]);
});

// THE LEAK ARM (#276). `attachToChat` is host authority and the junction row outlives the attacher's seat,
// so the resolver is the ONLY thing standing between this pane and naming a room the caller was kicked from.
// When it drops a room, the payload carries no trace of it: no id, no "…and 1 more" — a residue would leak
// exactly the fact the filter exists to withhold.
test("a room the caller may no longer see is ABSENT, with no residue", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, {
    // Chat's answer for an ex-member: the candidate is simply not in the reply.
    resolveVisibleRooms: () => Promise.resolve([]),
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId });

  const view = await h.service.listAttachments({ principal: principalFor(owner), id: document.id });
  expect(view.chats).toEqual([]);
  // Nothing anywhere in the payload counts, ids or otherwise, what was withheld.
  expect(JSON.stringify(view)).not.toContain(chatId);
});

// An unattached document asks chat NOTHING — the harness's throwing default is the assertion: if the verb
// called the resolver with an empty candidate list this test would fail with "not stubbed".
test("a document attached to no room never consults chat at all", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  const view = await h.service.listAttachments({ principal: principalFor(owner), id: document.id });
  expect(view).toEqual({ global: false, chats: [], characters: [] });
});

test("a non-owner cannot list a foreign document's attachments", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await expect(h.service.listAttachments({ principal: principalFor(other), id: document.id })).rejects.toBeInstanceOf(DocumentNotFoundError);
});
