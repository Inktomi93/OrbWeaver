// verb: listDistributedPlugins — the published set, admin-only (D147 clause (d)). Two pins: the projection is
// deployment POLICY (a bundle the server publishes, never anyone's install state), and a plain member cannot
// read it at all — their own copies already arrive through `list`.

import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

test("an admin reads what the deployment publishes, oldest first", async () => {
  const db = await freshDb();
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve([]) });

  await h.service.installForAllUsers({ caller: ownerPrincipalFor(boss), bundle: makeBundle({ id: "house-style", name: "House Style" }) });
  await h.service.installForAllUsers({
    caller: ownerPrincipalFor(boss),
    bundle: makeBundle({ id: "note-taker", name: "Note Taker", version: "2.1.0" }),
  });

  const published = await h.service.listDistributedPlugins({ caller: ownerPrincipalFor(boss) });

  expect(published.map((p) => ({ slug: p.slug, name: p.name, version: p.version }))).toEqual([
    { slug: "house-style", name: "House Style", version: "1.0.0" },
    { slug: "note-taker", name: "Note Taker", version: "2.1.0" },
  ]);
  // POLICY, not install state: no status, no grant, no crash counter on a distribution record.
  expect(Object.keys(published[0] ?? {}).sort()).toEqual(["distributedAt", "name", "slug", "updatedAt", "version"]);
});

test("a plain member cannot read the published set", async () => {
  const db = await freshDb();
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const member = await seedUser(db, { handle: castId<Handle>("member") });
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve([principalFor(member)]) });
  await h.service.installForAllUsers({ caller: ownerPrincipalFor(boss), bundle: makeBundle({ id: "house-style" }) });

  await expect(h.service.listDistributedPlugins({ caller: principalFor(member) })).rejects.toBeInstanceOf(DomainForbiddenError);
  // …and they still see their OWN copy, which is the read that belongs to them.
  expect((await h.service.list({ caller: principalFor(member) })).map((r) => r.slug)).toEqual(["house-style"]);
});
