// verb: applyDistributedPlugins — the NEW-USER half of the server-wide fan-out (D147 clause (d)). A user
// created after a publish never appeared in that publish's recipient list, so this is what reaches them.
//
// The pins: a user who missed the fan-out ends up with the same CONSENT-FIRST row every recipient got; it is
// SELF-scoped (a plain member drives it for themselves, with no admin anywhere); and it is idempotent by slug,
// so a second drive mints nothing and a user's own pre-existing copy is never disturbed.

import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

test("a user created AFTER the publish gets the distributed row — disabled, ungranted, consent-pending", async () => {
  const db = await freshDb();
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const early = await seedUser(db, { handle: castId<Handle>("early") });
  // The fan-out sees only the users that existed when it ran.
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve([principalFor(early)]) });
  await h.service.installForAllUsers({
    caller: ownerPrincipalFor(boss),
    bundle: makeBundle({ id: "house-style", name: "House Style", capabilities: ["chat.transform"] }),
  });

  // …and now someone signs up.
  const late = await seedUser(db, { handle: castId<Handle>("late") });
  expect(await h.service.list({ caller: principalFor(late) })).toEqual([]);

  const applied = await h.service.applyDistributedPlugins({ caller: principalFor(late) });

  expect(applied).toEqual({ installedSlugs: ["house-style"], skippedSlugs: [] });
  const [row] = await h.service.list({ caller: principalFor(late) });
  expect(row).toMatchObject({ slug: "house-style", status: "disabled", grantedCapabilities: [], reconsentPending: true });
  // Arriving at a populated pane never means arriving at a running one.
  expect(h.port.created).toEqual([]);
});

test("a second drive mints nothing, and a slug the user already holds is left exactly as it was", async () => {
  const db = await freshDb();
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const late = await seedUser(db, { handle: castId<Handle>("late") });
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve([]) });
  await h.service.installForAllUsers({
    caller: ownerPrincipalFor(boss),
    bundle: makeBundle({ id: "house-style", capabilities: ["chat.transform"] }),
  });

  await h.service.applyDistributedPlugins({ caller: principalFor(late) });
  // The user consents to their copy — the state a re-drive must not stomp.
  const [mine] = await h.service.list({ caller: principalFor(late) });
  const mineId = mine?.id ?? castId("plugin_missing");
  await h.service.setGrant({ caller: principalFor(late), pluginId: mineId, grant: ["chat.transform"], acknowledgedNetHosts: [] });

  const second = await h.service.applyDistributedPlugins({ caller: principalFor(late) });

  expect(second).toEqual({ installedSlugs: [], skippedSlugs: ["house-style"] });
  const rows = await h.service.list({ caller: principalFor(late) });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: mineId, grantedCapabilities: ["chat.transform"], reconsentPending: false });
});

test("nothing published means nothing applied — the empty deployment is a clean no-op", async () => {
  const db = await freshDb();
  const late = await seedUser(db, { handle: castId<Handle>("late") });
  const h = makePluginHarness(db);

  expect(await h.service.applyDistributedPlugins({ caller: principalFor(late) })).toEqual({ installedSlugs: [], skippedSlugs: [] });
  expect(await h.service.list({ caller: principalFor(late) })).toEqual([]);
});

test("the caller only ever installs for THEMSELVES — one user's drive touches nobody else", async () => {
  const db = await freshDb();
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const one = await seedUser(db, { handle: castId<Handle>("one") });
  const two = await seedUser(db, { handle: castId<Handle>("two") });
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve([]) });
  await h.service.installForAllUsers({ caller: ownerPrincipalFor(boss), bundle: makeBundle({ id: "house-style" }) });

  await h.service.applyDistributedPlugins({ caller: principalFor(one) });

  expect((await h.service.list({ caller: principalFor(one) })).map((r) => r.slug)).toEqual(["house-style"]);
  expect(await h.service.list({ caller: principalFor(two as UserId) })).toEqual([]);
});
