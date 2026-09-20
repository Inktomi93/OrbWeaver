// verb: remove — delete an owned document; the DB CASCADE clears its document_chunks + all scope-junction
// rows. A foreign/missing id throws DocumentNotFoundError.

import { chatDocuments, documentChunks, documents, globalDocuments } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedChat, seedChatHost, seedUser } from "../_support.ts";

test("removing a document cascades its chunks and junction rows away", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "doc.md", text: "canon that chunks nicely" });
  await h.ingest.ingestDocument({ documentId: document.id, signal: new AbortController().signal });
  await h.service.attachGlobal({ principal: principalFor(owner), documentId: document.id });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId });

  await h.service.remove({ principal: principalFor(owner), id: document.id });

  expect(await db.select().from(documents).where(eq(documents.id, document.id))).toHaveLength(0);
  expect(await db.select().from(documentChunks).where(eq(documentChunks.documentId, document.id))).toHaveLength(0);
  expect(await db.select().from(globalDocuments).where(eq(globalDocuments.documentId, document.id))).toHaveLength(0);
  expect(await db.select().from(chatDocuments).where(eq(chatDocuments.documentId, document.id))).toHaveLength(0);
  // Five announces, one per real write, in order: createFromText · the ingest TERMINAL (no documentId — a
  // pass touches many) · attachGlobal · attachToChat · remove. The delete's event fires AFTER the row and
  // its cascade are gone, which is safe precisely because there is no durable event row to orphan and the
  // subscriber's discipline is id-only re-read (it re-reads the list and finds the document absent).
  expect(h.userEvents).toEqual([
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
    { userId: owner, event: { type: "databankChanged" } },
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
  ]);
});

test("a non-owner's remove throws DocumentNotFoundError (nothing deleted)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "doc.md", text: "canon" });

  await expect(h.service.remove({ principal: principalFor(other), id: document.id })).rejects.toBeInstanceOf(DocumentNotFoundError);
  expect(await db.select().from(documents).where(eq(documents.id, document.id))).toHaveLength(1);
  // Nothing was deleted, so nothing is announced — only the create's event stands.
  expect(h.userEvents).toEqual([{ userId: owner, event: { type: "databankChanged", documentId: document.id } }]);
});

// ── #2471 — the DELETE arm, and the reason it needs a PRE-WRITE capture ───────────────────────
// All three D85 scope junctions CASCADE with the `documents` row, so a reach resolved AFTER the delete
// answers ∅ always — a post-write fan would be a dead wire that READS as coverage. The verb snapshots the
// rooms before the DELETE and fans the thunk only once RETURNING confirms the row was the caller's.
test("#2471 removing an attached document fans the room it was attached to — the junctions are gone by then", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const member = await seedUser(db, { handle: castId<Handle>("member") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, owner);
  await seedChatHost(db, chatId, member, "member");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId });
  h.roomFans.length = 0;

  await h.service.remove({ principal: principalFor(owner), id: document.id });

  expect(h.roomFans).toEqual([{ type: "roomEntityChanged", chatId, entity: "databank" }]);
  // The co-member's rack is empty — and it is the FAN that tells their device to go and find that out.
  expect(await h.service.listActiveForChat({ principal: principalFor(member), chatId })).toEqual([]);
});

test("#2471 a REFUSED remove (foreign document) fans nothing — the captured thunk is discarded", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const attacker = await seedUser(db, { handle: castId<Handle>("attacker") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, owner);
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId });
  h.roomFans.length = 0;

  await expect(h.service.remove({ principal: principalFor(attacker), id: document.id })).rejects.toBeInstanceOf(DocumentNotFoundError);

  expect(h.roomFans).toEqual([]);
});
