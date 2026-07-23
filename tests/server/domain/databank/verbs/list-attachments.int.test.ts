// verb: listAttachments — where an owned document is attached (owner-gated). Returns the global flag + the
// chat/character id lists (the reverse junction lookup). A non-owner throws DocumentNotFoundError.

import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedChat, seedUser } from "../_support.ts";

test("reports the document's global + chat attachments", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await h.service.attachGlobal({ principal: principalFor(owner), documentId: document.id });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId });

  const view = await h.service.listAttachments({ principal: principalFor(owner), id: document.id });
  expect(view.global).toBe(true);
  expect(view.chatIds).toEqual([chatId]);
  expect(view.characterIds).toEqual([]);
});

test("a non-owner cannot list a foreign document's attachments", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const other = await seedUser(db, { handle: "other" });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await expect(h.service.listAttachments({ principal: principalFor(other), id: document.id })).rejects.toBeInstanceOf(DocumentNotFoundError);
});
