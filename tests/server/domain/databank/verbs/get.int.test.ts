// verb: get — owner-scoped fetchOwned. Load-bearing: returns the detail view (extractorVersion always,
// extractedText ONLY with includeText); a foreign/missing id throws DocumentNotFoundError (no existence leak).

import type { DocumentId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedUser } from "../_support.ts";

const TEXT = "The salt marsh swallowed the tower whole.";

test("returns the detail view; extractedText only when includeText", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "marsh.md", text: TEXT });

  const lean = await h.service.get({ principal: principalFor(owner), id: document.id });
  expect(lean.extractorVersion).toBe("none");
  expect(lean.extractedText).toBeUndefined();

  const full = await h.service.get({ principal: principalFor(owner), id: document.id, includeText: true });
  expect(full.extractedText).toBe(TEXT);
});

test("a non-owner's get throws DocumentNotFoundError (collapses with missing — no leak)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "marsh.md", text: TEXT });

  await expect(h.service.get({ principal: principalFor(other), id: document.id })).rejects.toBeInstanceOf(DocumentNotFoundError);
  await expect(h.service.get({ principal: principalFor(owner), id: castId<DocumentId>("document_missing") })).rejects.toBeInstanceOf(DocumentNotFoundError);
});
