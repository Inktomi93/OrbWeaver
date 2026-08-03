// verb: remove — delete an owned document; the DB CASCADE clears its document_chunks + all scope-junction
// rows. A foreign/missing id throws DocumentNotFoundError.

import { chatDocuments, documentChunks, documents, globalDocuments } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedChat, seedUser } from "../_support.ts";

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
});

test("a non-owner's remove throws DocumentNotFoundError (nothing deleted)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "doc.md", text: "canon" });

  await expect(h.service.remove({ principal: principalFor(other), id: document.id })).rejects.toBeInstanceOf(DocumentNotFoundError);
  expect(await db.select().from(documents).where(eq(documents.id, document.id))).toHaveLength(1);
});
