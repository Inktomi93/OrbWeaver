// verb: listGlobal — the caller's global document ids (databank-surface-spec D-1). Load-bearing: the
// OWNER SCOPE (another user's global document must never appear — the junction's `ownerId` is the belt) and
// that the set tracks attach/detach, since the library row's `Everywhere` toggle renders straight off it.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedUser } from "../../_support.ts";

test("returns only the caller's OWN global documents, and tracks attach/detach", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const { document: mine } = await h.service.createFromText({ principal: principalFor(owner), name: "mine.md", text: "canon" });
  const { document: alsoMine } = await h.service.createFromText({ principal: principalFor(owner), name: "also.md", text: "more canon" });
  const { document: theirs } = await h.service.createFromText({ principal: principalFor(stranger), name: "theirs.md", text: "not mine" });

  expect(await h.service.listGlobal({ principal: principalFor(owner) })).toEqual([]);

  await h.service.attachGlobal({ principal: principalFor(owner), documentId: mine.id });
  await h.service.attachGlobal({ principal: principalFor(stranger), documentId: theirs.id });

  // The stranger's global document is invisible here even though it IS global — owner-scoped on the junction.
  expect(await h.service.listGlobal({ principal: principalFor(owner) })).toEqual([mine.id]);
  expect(await h.service.listGlobal({ principal: principalFor(stranger) })).toEqual([theirs.id]);

  await h.service.attachGlobal({ principal: principalFor(owner), documentId: alsoMine.id });
  expect([...(await h.service.listGlobal({ principal: principalFor(owner) }))].sort()).toEqual([mine.id, alsoMine.id].sort());

  await h.service.detachGlobal({ principal: principalFor(owner), documentId: mine.id });
  expect(await h.service.listGlobal({ principal: principalFor(owner) })).toEqual([alsoMine.id]);
});

test("a stranger cannot make someone else's document global, so it can never enter their set", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "mine.md", text: "canon" });

  await expect(h.service.attachGlobal({ principal: principalFor(stranger), documentId: document.id })).rejects.toBeInstanceOf(DocumentNotFoundError);
  expect(await h.service.listGlobal({ principal: principalFor(stranger) })).toEqual([]);
});
