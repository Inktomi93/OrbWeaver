// verb: attachGlobal — mark an owned document global, idempotently. Load-bearing: the ownership gate — a
// FOREIGN document id must NEVER attach (throws DocumentNotFoundError, no junction row).

import { globalDocuments } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedUser } from "../../_support.ts";

test("marks the owned document global; re-attach is idempotent", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await h.service.attachGlobal({ principal: principalFor(owner), documentId: document.id });
  await h.service.attachGlobal({ principal: principalFor(owner), documentId: document.id }); // idempotent
  const rows = await db.select().from(globalDocuments).where(eq(globalDocuments.documentId, document.id));
  expect(rows).toEqual([{ ownerId: owner, documentId: document.id }]);
  // TWO events, not three: the create and the FIRST attach announced; the idempotent re-attach returned
  // before any write and announced nothing (event-bus coverage survey H3). A no-op toggle that told every
  // device to refetch would be the storm the coarse member exists to avoid.
  expect(h.userEvents).toEqual([
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
  ]);
});

test("a foreign document id NEVER attaches — throws DocumentNotFoundError, no junction row (cross-tenant)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const attacker = await seedUser(db, { handle: castId<Handle>("attacker") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await expect(h.service.attachGlobal({ principal: principalFor(attacker), documentId: document.id })).rejects.toBeInstanceOf(DocumentNotFoundError);
  expect(await db.select().from(globalDocuments).where(eq(globalDocuments.documentId, document.id))).toHaveLength(0);
  // The cross-tenant refusal announces on NO channel — not the attacker's (nothing of theirs changed) and
  // not the owner's (nothing of theirs changed either). Only the create's event stands.
  expect(h.userEvents).toEqual([{ userId: owner, event: { type: "databankChanged", documentId: document.id } }]);
});
