// verb: attachToChat — attach a caller-OWNED document to a chat room, HOST-gated. Load-bearing: the host
// authority (a non-host attach rejects, no junction row); the ownership gate (a FOREIGN document never
// attaches even for the host); idempotent re-attach.

import { chatDocuments } from "@orb/db";
import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedChat, seedUser } from "../../_support.ts";

test("host attaches an owned document to the room; re-attach idempotent", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db); // default ensureChatHost resolves (host)
  const owner = await seedUser(db, { handle: "owner" });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId }); // idempotent
  const rows = await db.select().from(chatDocuments).where(eq(chatDocuments.documentId, document.id));
  expect(rows).toEqual([{ chatId, documentId: document.id }]);
});

test("a non-host attach is rejected by the injected host guard — no junction row", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { ensureChatHost: () => Promise.reject(new Error("not host")) });
  const owner = await seedUser(db, { handle: "owner" });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await expect(h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId })).rejects.toThrow("not host");
  expect(await db.select().from(chatDocuments).where(eq(chatDocuments.documentId, document.id))).toHaveLength(0);
});

test("a foreign document NEVER attaches to a chat even for the host (cross-tenant)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db); // host guard resolves
  const owner = await seedUser(db, { handle: "owner" });
  const attacker = await seedUser(db, { handle: "attacker" });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await expect(h.service.attachToChat({ principal: principalFor(attacker), documentId: document.id, chatId })).rejects.toBeInstanceOf(DocumentNotFoundError);
  expect(await db.select().from(chatDocuments).where(eq(chatDocuments.documentId, document.id))).toHaveLength(0);
});
