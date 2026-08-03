// verb: detachGlobal — clear a document's global scope, idempotently (a detach of a non-attached pair is a
// no-op void).

import { globalDocuments } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedUser } from "../../_support.ts";

test("detach removes the global row; a repeat detach is a silent no-op", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });
  await h.service.attachGlobal({ principal: principalFor(owner), documentId: document.id });

  await h.service.detachGlobal({ principal: principalFor(owner), documentId: document.id });
  await h.service.detachGlobal({ principal: principalFor(owner), documentId: document.id }); // idempotent no-op
  expect(await db.select().from(globalDocuments).where(eq(globalDocuments.documentId, document.id))).toHaveLength(0);
});
