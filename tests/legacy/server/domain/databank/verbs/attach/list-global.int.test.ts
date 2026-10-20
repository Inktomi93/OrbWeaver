// verb: listGlobal — the caller's global document ids. Load-bearing: the
// OWNER SCOPE (another user's global document must never appear — the junction's `ownerId` is the belt) and
// that the set tracks attach/detach, since the library row's `Everywhere` toggle renders straight off it.
// @subject packages/server/src/domain/databank/verbs/attach/list-global.ts

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { DocumentNotFoundError } from "#server/domain/databank/index.ts";
import { makeDatabankHarness, principalFor, seedUser } from "../../_support.ts";

test("returns only the caller's OWN global documents, and tracks attach/detach", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const { document: mine } = await h.service.createFromText({ principal: await principalFor(db, owner), name: "mine.md", text: "canon" });
  const { document: alsoMine } = await h.service.createFromText({ principal: await principalFor(db, owner), name: "also.md", text: "more canon" });
  const { document: theirs } = await h.service.createFromText({ principal: await principalFor(db, stranger), name: "theirs.md", text: "not mine" });

  expect(await h.service.listGlobal({ principal: await principalFor(db, owner) })).toEqual([]);

  await h.service.attachGlobal({ principal: await principalFor(db, owner), documentId: mine.id });
  await h.service.attachGlobal({ principal: await principalFor(db, stranger), documentId: theirs.id });

  // The stranger's global document is invisible here even though it IS global — owner-scoped on the junction.
  expect(await h.service.listGlobal({ principal: await principalFor(db, owner) })).toEqual([mine.id]);
  expect(await h.service.listGlobal({ principal: await principalFor(db, stranger) })).toEqual([theirs.id]);

  await h.service.attachGlobal({ principal: await principalFor(db, owner), documentId: alsoMine.id });
  expect((await h.service.listGlobal({ principal: await principalFor(db, owner) })).toSorted()).toEqual([mine.id, alsoMine.id].sort());

  await h.service.detachGlobal({ principal: await principalFor(db, owner), documentId: mine.id });
  expect(await h.service.listGlobal({ principal: await principalFor(db, owner) })).toEqual([alsoMine.id]);
});

test("a stranger cannot make someone else's document global, so it can never enter their set", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const { document } = await h.service.createFromText({ principal: await principalFor(db, owner), name: "mine.md", text: "canon" });

  await expect(h.service.attachGlobal({ principal: await principalFor(db, stranger), documentId: document.id })).rejects.toBeInstanceOf(DocumentNotFoundError);
  expect(await h.service.listGlobal({ principal: await principalFor(db, stranger) })).toEqual([]);
});
