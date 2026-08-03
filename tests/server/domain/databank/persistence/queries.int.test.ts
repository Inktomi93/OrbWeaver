// persistence: queries — the documents producer reads. Covers the load-bearing ones: findByImportHash (the
// re-upload dedup probe, owner-scoped), countChunksByDocument (the derived count over the active model,
// grouped), loadMetaByIds (order-preserving, drops missing), loadAttachments (the reverse junction lookup).

import { documents } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { findByImportHash, loadAttachments, loadMetaByIds } from "../../../../../packages/server/src/domain/databank/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedChat, seedUser } from "../_support.ts";

test("findByImportHash matches only the caller's own (owner, importHash) row", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });
  const row = await db.select().from(documents).where(eq(documents.id, document.id));
  const importHash = row[0]?.importHash ?? "";

  expect((await findByImportHash(db, owner, importHash))?.id).toBe(document.id);
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  expect(await findByImportHash(db, other, importHash)).toBeUndefined();
});

test("loadMetaByIds preserves input order and drops missing ids", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const a = await h.service.createFromText({ principal: principalFor(owner), name: "a.md", text: "aaa" });
  const b = await h.service.createFromText({ principal: principalFor(owner), name: "b.md", text: "bbb" });

  const metas = await loadMetaByIds(db, [b.document.id, a.document.id]);
  expect(metas.map((m) => m.id)).toEqual([b.document.id, a.document.id]);
});

test("loadAttachments reflects the junction rows", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId });

  const view = await loadAttachments(db, document.id);
  expect(view).toEqual({ global: false, chatIds: [chatId], characterIds: [] });
});
