// verb: listPlugins — the owner's own plugins, newest-installed first (02 §4). Owner-scoped: a stranger's
// plugins never appear.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

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

test("the listed row projects the manifest's ASK and its net.fetch reach (the row-path projection)", async () => {
  // The `toPluginView` half of the asked-vs-allowed pair — read back off the stored row rather than built in
  // the install verb, so a manifest field that stops being lifted here is caught even though install's own
  // return still looks right.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "reach", capabilities: ["chat.read", "net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: ["chat.read"],
  });

  const [row] = await h.service.list({ caller: ownerPrincipalFor(owner) });
  expect(row?.declaredCapabilities).toEqual(["chat.read", "net.fetch"]);
  expect(row?.grantedCapabilities).toEqual(["chat.read"]);
  expect(row?.netHosts).toEqual(["api.vendor.example"]);
});

test("an owner with no plugins gets an empty list", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  expect(await h.service.list({ caller: ownerPrincipalFor(owner) })).toEqual([]);
});

// D147 — `list` is the read the per-user pane suspends on, so the scoping has to hold for the PRINCIPAL CLASS
// that pane is now open to. Two things at once: a plain user sees their OWN row (the pane is not empty for
// them), and the box owner's rows are absent from it (a global role does not widen a fetchOwned read — the
// verb takes no id, so `WHERE owner_id = caller.userId` is the whole query).
test("a plain user (role:'user') lists their own rows, and the box owner's are not among them", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const user = await seedUser(db, { handle: castId<Handle>("user") });
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });

  const mine = await h.service.install({ caller: principalFor(user), bundle: makeBundle({ id: "mine" }), grant: [] });
  const theirs = await h.service.install({ caller: ownerPrincipalFor(boss), bundle: makeBundle({ id: "theirs" }), grant: [] });

  expect((await h.service.list({ caller: principalFor(user) })).map((p) => p.id)).toEqual([mine.id]);
  // …and symmetrically: the apex role's list is ITS OWN rows, not the deployment's.
  expect((await h.service.list({ caller: ownerPrincipalFor(boss) })).map((p) => p.id)).toEqual([theirs.id]);
});
