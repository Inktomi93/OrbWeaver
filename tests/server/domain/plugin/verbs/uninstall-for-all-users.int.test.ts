// verb: uninstallForAllUsers — withdrawing a published plugin (D147 clause (d)). Two properties carry the
// file: the ADMIN gate (a plain user cannot withdraw the deployment's plugin from everyone), and the
// DIVERGENCE POLICY — a recipient whose row is at a different version has taken the plugin over, so an admin
// withdrawal must SKIP it and SAY SO rather than delete a thing that person chose.
//
// The skip is asserted from both sides: the diverged user still holds their row (with its grant intact), and
// the result names them. A silent skip would leave an admin believing the plugin is gone everywhere.

import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotDistributedError } from "@orb/server/domain/plugin";
import { listDistributions } from "../../../../../packages/server/src/domain/plugin/persistence/distributed-plugins.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

async function cast(db: Awaited<ReturnType<typeof freshDb>>): Promise<{ readonly boss: UserId; readonly members: readonly UserId[] }> {
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const ann = await seedUser(db, { handle: castId<Handle>("ann") });
  const bo = await seedUser(db, { handle: castId<Handle>("bo") });
  return { boss, members: [ann, bo] };
}

test("withdrawing removes every distributed copy and the record itself", async () => {
  const db = await freshDb();
  const { boss, members } = await cast(db);
  const [ann, bo] = members;
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve(members.map((id) => principalFor(id))) });
  await h.service.installForAllUsers({ caller: ownerPrincipalFor(boss), bundle: makeBundle({ id: "house-style" }) });

  const result = await h.service.uninstallForAllUsers({ caller: ownerPrincipalFor(boss), slug: "house-style" });

  expect(result).toMatchObject({ slug: "house-style", version: "1.0.0", applied: 2, skipped: [] });
  expect(await h.service.list({ caller: principalFor(ann as UserId) })).toEqual([]);
  expect(await h.service.list({ caller: principalFor(bo as UserId) })).toEqual([]);
  expect(await listDistributions(db)).toEqual([]);
  // The real uninstall ran, so the per-user bundle copies were reaped too.
  expect(h.storedBytes.size).toBe(1); // only the ADMIN's published copy survives — it is their own upload
});

test("a recipient who UPGRADED their copy is skipped and reported, with their grant untouched", async () => {
  const db = await freshDb();
  const { boss, members } = await cast(db);
  const [ann, bo] = members;
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve(members.map((id) => principalFor(id))) });
  await h.service.installForAllUsers({
    caller: ownerPrincipalFor(boss),
    bundle: makeBundle({ id: "house-style", capabilities: ["chat.transform"] }),
  });

  // Ann consents, then upgrades her own copy to a version the deployment never published.
  const [hers] = await h.service.list({ caller: principalFor(ann as UserId) });
  const hersId = hers?.id ?? castId("plugin_missing");
  await h.service.setGrant({ caller: principalFor(ann as UserId), pluginId: hersId, grant: ["chat.transform"], acknowledgedNetHosts: [] });
  await h.service.upgrade({
    caller: principalFor(ann as UserId),
    pluginId: hersId,
    bundle: makeBundle({ id: "house-style", version: "1.4.0", capabilities: ["chat.transform"] }),
  });

  const result = await h.service.uninstallForAllUsers({ caller: ownerPrincipalFor(boss), slug: "house-style" });

  expect(result.applied).toBe(1);
  expect(result.skipped).toEqual([{ userId: ann, userHandle: castId<Handle>("ann"), reason: "version-diverged" }]);
  // HERS SURVIVES, at her version, with the grant she gave — the withdrawal touched neither.
  const [survivor] = await h.service.list({ caller: principalFor(ann as UserId) });
  expect(survivor?.id).toBe(hersId);
  expect(survivor?.version).toBe("1.4.0");
  expect(survivor?.grantedCapabilities).toEqual(["chat.transform"]);
  // Bo, still on the distributed version, lost his.
  expect(await h.service.list({ caller: principalFor(bo as UserId) })).toEqual([]);
  // The record is gone either way: no FUTURE user receives a withdrawn plugin.
  expect(await listDistributions(db)).toEqual([]);
});

test("a user who never held the slug is neither a skip nor an error", async () => {
  const db = await freshDb();
  const { boss, members } = await cast(db);
  const [ann, bo] = members;
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve(members.map((id) => principalFor(id))) });
  await h.service.installForAllUsers({ caller: ownerPrincipalFor(boss), bundle: makeBundle({ id: "house-style" }) });
  // Bo removes his own copy first — his own act, his own row.
  const [his] = await h.service.list({ caller: principalFor(bo as UserId) });
  await h.service.uninstall({ caller: principalFor(bo as UserId), pluginId: his?.id ?? castId("plugin_missing") });

  const result = await h.service.uninstallForAllUsers({ caller: ownerPrincipalFor(boss), slug: "house-style" });

  // Only Ann was served; Bo is absent from BOTH counts (`skipped` is a list of decisions, not of non-events).
  expect(result.applied).toBe(1);
  expect(result.skipped).toEqual([]);
  expect(await h.service.list({ caller: principalFor(ann as UserId) })).toEqual([]);
});

test("a NON-ADMIN cannot withdraw — the record and every copy survive", async () => {
  const db = await freshDb();
  const { boss, members } = await cast(db);
  const [ann] = members;
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve(members.map((id) => principalFor(id))) });
  await h.service.installForAllUsers({ caller: ownerPrincipalFor(boss), bundle: makeBundle({ id: "house-style" }) });

  await expect(h.service.uninstallForAllUsers({ caller: principalFor(ann as UserId), slug: "house-style" })).rejects.toBeInstanceOf(DomainForbiddenError);

  expect(await listDistributions(db)).toHaveLength(1);
  expect((await h.service.list({ caller: principalFor(ann as UserId) })).map((r) => r.slug)).toEqual(["house-style"]);
});

test("withdrawing a slug the server never published is a typed refusal, not a silent no-op", async () => {
  const db = await freshDb();
  const { boss, members } = await cast(db);
  const [ann] = members;
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve(members.map((id) => principalFor(id))) });
  // Ann has her OWN install at that slug — which must not be reachable through the distribution path.
  await h.service.install({ caller: principalFor(ann as UserId), bundle: makeBundle({ id: "house-style" }), grant: [] });

  await expect(h.service.uninstallForAllUsers({ caller: ownerPrincipalFor(boss), slug: "house-style" })).rejects.toBeInstanceOf(PluginNotDistributedError);

  // The refusal is the point: an admin cannot delete a plugin off users' accounts by naming a slug nobody
  // published. Ann keeps hers.
  expect((await h.service.list({ caller: principalFor(ann as UserId) })).map((r) => r.slug)).toEqual(["house-style"]);
});
