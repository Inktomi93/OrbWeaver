// Boot step: reactivate-plugins (#1865) — after a respawn the durable row still says `enabled` while the
// in-process `PluginRegistry` is empty, so every plugin contribution silently vanishes until something
// re-activates it. These tests prove the disagreement is REAL (the restart arm is written red-first: the
// second service sees zero surfaces before the step runs) and that the step closes it.
//
// HOW A RESTART IS SIMULATED, and why it is faithful: a SECOND `makePluginHarness` over the SAME db. That is
// exactly the production split — the `plugins` rows and the CAS bytes are durable, the registry is a
// process-lifetime `Map` that dies with the process. The CAS bytes are carried across by copying
// `storedBytes` (the harness's asset fake reads that very map), because in production the bundle is on disk;
// a second harness with an empty CAS would fail activation for the WRONG reason and the test would pass
// while proving nothing.

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { plugins } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginHandlerRef, PluginInstance } from "@orb/server/domain/plugin";
import { eq } from "drizzle-orm";
import { reactivatePluginsOnBoot } from "../../../../packages/server/src/entry/boot/reactivate-plugins.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import type { PluginHarness } from "../../domain/plugin/_support.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../../domain/plugin/_support.ts";

/** A scripted resident carrying one PAGE surface — the anchor the Extensions section reads, which is the
 *  surface class the bug made disappear. */
function instanceWithPage(surfaceId: string): PluginInstance {
  return {
    tools: [],
    transforms: [],
    events: [],
    pubsub: [],
    commands: [],
    displayTransforms: [],
    macros: [],
    surfaces: [
      {
        id: surfaceId,
        anchor: "page",
        title: "Card Atlas",
        tier: "static",
        spec: { kind: "stack", children: [{ kind: "text", value: "hi" }] },
        onAction: castId<PluginHandlerRef>("plugin-handler-0"),
      },
    ],
  };
}

/** The RESTART: a fresh service (and therefore a fresh, empty registry) over the same db, with the durable
 *  CAS carried across. Returns the new harness. */
function restart(db: Db, previous: PluginHarness): PluginHarness {
  const next = makePluginHarness(db);
  for (const [assetId, bytes] of previous.storedBytes) {
    next.storedBytes.set(assetId, bytes);
  }
  return next;
}

/** The boot resolver seam, standing in for `createHostPrincipalResolver` — the step must resolve the ROW's
 *  owner, never a caller it was handed. */
function resolverFor(...owners: readonly UserId[]): (userId: UserId) => Promise<Principal> {
  const known = new Set(owners);
  return (userId: UserId): Promise<Principal> =>
    known.has(userId) ? Promise.resolve(ownerPrincipalFor(userId)) : Promise.reject(new Error(`test: no principal for ${userId}`));
}

test("a restart empties the registry, and the boot step brings every enabled plugin's surfaces back", async () => {
  const db = await freshDb();
  const first = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);

  first.port.script({ ok: true, instance: instanceWithPage("atlas") });
  const installed = await first.service.install({ caller, bundle: makeBundle({ id: "card-atlas", capabilities: ["ui.surface"] }), grant: ["ui.surface"] });
  await first.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  expect((await first.service.listSurfaces({ caller })).map((s) => s.id)).toEqual(["atlas"]);

  const second = restart(db, first);
  // RED-FIRST: this is the defect, asserted before the fix runs. The row is untouched and still `enabled`…
  expect((await second.service.list({ caller })).map((p) => p.status)).toEqual(["enabled"]);
  // …and yet the new process contributes nothing, because nothing re-activated it.
  expect(await second.service.listSurfaces({ caller })).toEqual([]);

  second.port.script({ ok: true, instance: instanceWithPage("atlas") });
  const report = await reactivatePluginsOnBoot({ db, setEnabled: second.service.setEnabled, resolvePrincipal: resolverFor(owner) });

  expect(report).toEqual({ restored: 1, failed: 0 });
  expect((await second.service.listSurfaces({ caller })).map((s) => s.id)).toEqual(["atlas"]);
});

test("a DISABLED row is left alone — the step restores the record, it does not turn plugins on", async () => {
  const db = await freshDb();
  const first = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);

  // Installed and never enabled: the seeded-example posture.
  await first.service.install({ caller, bundle: makeBundle({ id: "dormant" }), grant: [] });

  const second = restart(db, first);
  const report = await reactivatePluginsOnBoot({ db, setEnabled: second.service.setEnabled, resolvePrincipal: resolverFor(owner) });

  expect(report).toEqual({ restored: 0, failed: 0 });
  expect(second.port.created).toEqual([]); // no guest code ran
  expect((await second.service.list({ caller })).map((p) => p.status)).toEqual(["disabled"]);
});

test("one plugin's failed activation is counted and left `errored` — it never aborts the sweep", async () => {
  const db = await freshDb();
  const first = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);

  first.port.script({ ok: true, instance: instanceWithPage("bad") });
  const broken = await first.service.install({ caller, bundle: makeBundle({ id: "broken" }), grant: [] });
  await first.service.setEnabled({ caller, pluginId: broken.id, enabled: true });
  // The harness clock is FROZEN, so without this both rows stamp the SAME `installedAt` and the sweep's
  // `desc(installedAt)` order is a coin flip — the first shape of this test asserted an order it had not
  // actually created and reddened on the wrong row.
  first.advance(1000);
  first.port.script({ ok: true, instance: instanceWithPage("good") });
  const healthy = await first.service.install({ caller, bundle: makeBundle({ id: "healthy", capabilities: ["ui.surface"] }), grant: ["ui.surface"] });
  await first.service.setEnabled({ caller, pluginId: healthy.id, enabled: true });

  const second = restart(db, first);
  // `listEnabledAcrossOwners` orders by installedAt DESC, so `healthy` (installed second) is restored FIRST
  // and `broken` second — the failure lands on the LAST row, which is what proves the sweep did not abort
  // early. Both outcomes are scripted in that order.
  second.port.script({ ok: true, instance: instanceWithPage("good") });
  second.port.script({ ok: false, error: "the stored bundle is corrupt", log: [] });

  const report = await reactivatePluginsOnBoot({ db, setEnabled: second.service.setEnabled, resolvePrincipal: resolverFor(owner) });

  expect(report).toEqual({ restored: 1, failed: 1 });
  // The healthy one still came resident…
  expect((await second.service.listSurfaces({ caller })).map((s) => s.id)).toEqual(["good"]);
  // …and the broken one carries the durable record the log line only counts.
  const [row] = await db.select({ status: plugins.status, lastError: plugins.lastError }).from(plugins).where(eq(plugins.id, broken.id));
  expect(row?.status).toBe("errored");
  expect(row?.lastError).toContain("the stored bundle is corrupt");
});

test("an unresolvable owner fails only its own rows — the step never throws out of boot", async () => {
  const db = await freshDb();
  const first = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);

  first.port.script({ ok: true, instance: instanceWithPage("atlas") });
  const installed = await first.service.install({ caller, bundle: makeBundle({ id: "card-atlas" }), grant: [] });
  await first.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  const second = restart(db, first);
  // The resolver rejects for every id — a users-row read that failed at boot.
  const report = await reactivatePluginsOnBoot({ db, setEnabled: second.service.setEnabled, resolvePrincipal: resolverFor() });

  expect(report).toEqual({ restored: 0, failed: 1 });
  expect(second.port.created).toEqual([]);
});
