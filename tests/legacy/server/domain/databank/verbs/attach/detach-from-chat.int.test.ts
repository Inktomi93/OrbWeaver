// verb: detachFromChat — clear a document's chat scope, host-gated + idempotent.
// @subject packages/server/src/domain/databank/verbs/attach/detach-from-chat.ts

import { chatDocuments } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { makeDatabankHarness, principalFor, seedChat, seedUser } from "../../_support.ts";

test("host detach removes the chat row; a non-host detach is rejected", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: await principalFor(db, owner), name: "d.md", text: "canon" });
  await h.service.attachToChat({ principal: await principalFor(db, owner), documentId: document.id, chatId });

  await h.service.detachFromChat({ principal: await principalFor(db, owner), documentId: document.id, chatId });
  expect(await db.select().from(chatDocuments).where(eq(chatDocuments.documentId, document.id))).toHaveLength(0);
  // idempotent repeat
  await h.service.detachFromChat({ principal: await principalFor(db, owner), documentId: document.id, chatId });
});

test("a non-host detach is rejected by the injected host guard", async () => {
  const db = await freshDb();
  const denied = makeDatabankHarness(db, { ensureChatHost: () => Promise.reject(new Error("not host")) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await denied.service.createFromText({ principal: await principalFor(db, owner), name: "d.md", text: "canon" });

  await expect(denied.service.detachFromChat({ principal: await principalFor(db, owner), documentId: document.id, chatId })).rejects.toThrow("not host");
});
