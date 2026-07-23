// verb: rename — mutable display metadata only, bumps updatedAt, touches nothing derived. A foreign/missing
// id throws DocumentNotFoundError (the ownership check folds into the UPDATE … WHERE owner_id RETURNING).

import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedUser } from "../_support.ts";

test("renames an owned document and bumps updatedAt", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "old.md", text: "canon" });
  h.advance(500);

  const renamed = await h.service.rename({ principal: principalFor(owner), id: document.id, name: "new.md" });
  expect(renamed.name).toBe("new.md");
  expect(renamed.updatedAt).toBeGreaterThan(document.updatedAt);
});

test("a non-owner's rename throws DocumentNotFoundError", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const other = await seedUser(db, { handle: "other" });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "old.md", text: "canon" });

  await expect(h.service.rename({ principal: principalFor(other), id: document.id, name: "hijack.md" })).rejects.toBeInstanceOf(DocumentNotFoundError);
});
