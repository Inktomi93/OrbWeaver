// verb: listPlugins — the owner's own plugins, newest-installed first (02 §4). Owner-scoped: a stranger's
// plugins never appear.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

test("lists only the caller's plugins, newest-installed first", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });

  const first = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "alpha" }), grant: [] });
  h.advance(1000);
  const second = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "beta" }), grant: [] });
  await h.service.install({ caller: ownerPrincipalFor(other), bundle: makeBundle({ id: "gamma" }), grant: [] });

  const mine = await h.service.list({ caller: ownerPrincipalFor(owner) });
  expect(mine.map((p) => p.id)).toEqual([second.id, first.id]);
});

test("an owner with no plugins gets an empty list", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  expect(await h.service.list({ caller: ownerPrincipalFor(owner) })).toEqual([]);
});
