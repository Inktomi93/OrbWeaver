// verb: rename — mutable display metadata only, bumps updatedAt, touches nothing derived. A foreign/missing
// id throws DocumentNotFoundError (the ownership check folds into the UPDATE … WHERE owner_id RETURNING).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedUser } from "../_support.ts";

test("renames an owned document and bumps updatedAt", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "old.md", text: "canon" });
  h.advance(500);

  const renamed = await h.service.rename({ principal: principalFor(owner), id: document.id, name: "new.md" });
  expect(renamed.name).toBe("new.md");
  expect(renamed.updatedAt).toBeGreaterThan(document.updatedAt);
  // The create + the rename each announced on the per-user freshness plane (event-bus coverage survey H3):
  // before `databankChanged` the write tier named its own reads and no SECOND tab ever reconciled.
  expect(h.userEvents).toEqual([
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
  ]);
});

test("a non-owner's rename throws DocumentNotFoundError", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "old.md", text: "canon" });

  await expect(h.service.rename({ principal: principalFor(other), id: document.id, name: "hijack.md" })).rejects.toBeInstanceOf(DocumentNotFoundError);
  // A REFUSED write announces nothing — the emit sits after the RETURNING that proved ownership, so only the
  // create's event stands. (And it went to the OWNER's channel, never the foreign caller's.)
  expect(h.userEvents).toEqual([{ userId: owner, event: { type: "databankChanged", documentId: document.id } }]);
});
