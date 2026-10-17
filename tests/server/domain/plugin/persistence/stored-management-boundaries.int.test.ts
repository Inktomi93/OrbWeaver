// @subject packages/server/src/domain/plugin/persistence/plugins.ts
// @subject packages/server/src/domain/plugin/verbs/set-enabled.ts
// @subject packages/server/src/domain/plugin/verbs/set-grant.ts
import { databaseHandle } from "@orb/db/wiring-driver";
import "@orb/testkit/node/composed-real.ts";
import { pluginGrantTasks, pluginViewSchema } from "@orb/contracts/plugin";
import { plugins } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { createPluginGrantTasksOf } from "@orb/server/domain/plugin";
import { packShowcaseBundle, SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

async function installed(harness: ServerTestHarness): Promise<{
  readonly caller: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly view: Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["install"]>>;
}> {
  const caller = await harness.principalFor((await harness.actor()).id);
  const bundle = await packShowcaseBundle(SHOWCASE_PLUGIN_SLUGS[0]);
  if (bundle === null) {
    throw new Error("the actual showcase package did not produce its bundle");
  }
  const view = await harness.services.plugin.install({ caller, bundle, grant: [] });
  return { caller, view };
}

for (const field of ["manifest", "grantedCapabilities", "widenedNetHosts"] as const) {
  test(`owned malformed ${field} refuses lifecycle and grant changes before persistent effects`, async ({ harness }) => {
    const { caller, view } = await installed(harness);
    const rows = await harness.db.select({ manifest: plugins.manifest }).from(plugins).where(eq(plugins.id, view.id));
    const manifest = rows[0]?.manifest;
    if (manifest === undefined) {
      throw new Error("the real install omitted its persisted manifest");
    }
    if (field === "manifest") {
      await harness.db
        .update(plugins)
        .set({ manifest: sql`${JSON.stringify({ ...manifest, hostVersion: false })}` })
        .where(eq(plugins.id, view.id));
    } else if (field === "grantedCapabilities") {
      await harness.db
        .update(plugins)
        .set({ grantedCapabilities: sql`${JSON.stringify(["not-a-capability"])}` })
        .where(eq(plugins.id, view.id));
    } else {
      await harness.db
        .update(plugins)
        .set({ pendingReconsent: true, widenedNetHosts: sql`${JSON.stringify([false])}` })
        .where(eq(plugins.id, view.id));
    }
    const before = await harness.db
      .select({
        status: plugins.status,
        updatedAt: plugins.updatedAt,
        pendingReconsent: plugins.pendingReconsent,
        consecutiveCrashes: plugins.consecutiveCrashes,
      })
      .from(plugins)
      .where(eq(plugins.id, view.id));
    harness.clock.advance(1000);
    await expect(harness.services.plugin.setEnabled({ caller, pluginId: view.id, enabled: false })).rejects.toBeInstanceOf(z.ZodError);
    await expect(harness.services.plugin.setGrant({ caller, pluginId: view.id, grant: [], acknowledgedNetHosts: [] })).rejects.toBeInstanceOf(z.ZodError);
    await expect(harness.services.plugin.list({ caller })).rejects.toBeInstanceOf(z.ZodError);
    const after = await harness.db
      .select({
        status: plugins.status,
        updatedAt: plugins.updatedAt,
        pendingReconsent: plugins.pendingReconsent,
        consecutiveCrashes: plugins.consecutiveCrashes,
      })
      .from(plugins)
      .where(eq(plugins.id, view.id));
    expect(after).toEqual(before);
  });
}

test("a foreign malformed manifest remains absent even for an actual admin and is never parsed by management", async ({ harness }) => {
  const { view } = await installed(harness);
  const foreign = await harness.principalFor((await harness.actor({ role: "admin" })).id);
  await harness.db
    .update(plugins)
    .set({ manifest: sql`${"{"}` })
    .where(eq(plugins.id, view.id));
  harness.clock.advance(1000);
  await expect(harness.services.plugin.setEnabled({ caller: foreign, pluginId: view.id, enabled: false })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(harness.services.plugin.setGrant({ caller: foreign, pluginId: view.id, grant: [], acknowledgedNetHosts: [] })).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
  expect(await harness.services.plugin.list({ caller: foreign })).toEqual([]);
  const rows = await harness.db.select({ status: plugins.status, updatedAt: plugins.updatedAt }).from(plugins).where(eq(plugins.id, view.id));
  expect(rows).toEqual([{ status: "disabled", updatedAt: view.updatedAt }]);
});

test("valid stored management data still allows the explicit disabled grant act and projects the actual manifest", async ({ harness }) => {
  const { caller, view } = await installed(harness);
  harness.clock.advance(1000);
  const granted = pluginViewSchema.parse(await harness.services.plugin.setGrant({ caller, pluginId: view.id, grant: [], acknowledgedNetHosts: [] }));
  expect(granted).toMatchObject({
    id: view.id,
    status: "disabled",
    declaredCapabilities: view.declaredCapabilities,
    grantedCapabilities: [],
    updatedAt: harness.clock.now(),
  });
  expect(await harness.services.plugin.list({ caller })).toEqual([granted]);
});

test("the actual credential grant-task projection validates its owned stored manifest before deriving authority", async ({ harness }) => {
  const { caller, view } = await installed(harness);
  const tasksOf = createPluginGrantTasksOf(databaseHandle(harness.db));
  expect(await tasksOf(view.id, caller.userId)).toEqual(pluginGrantTasks(view.declaredCapabilities));
  const rows = await harness.db.select({ manifest: plugins.manifest }).from(plugins).where(eq(plugins.id, view.id));
  const manifest = rows[0]?.manifest;
  if (manifest === undefined) {
    throw new Error("the actual installed manifest is missing");
  }
  await harness.db
    .update(plugins)
    .set({ manifest: sql`${JSON.stringify({ ...manifest, hostVersion: false })}` })
    .where(eq(plugins.id, view.id));
  await expect(tasksOf(view.id, caller.userId)).rejects.toBeInstanceOf(z.ZodError);
});

test("a foreign malformed grant-task manifest is never privately parsed", async ({ harness }) => {
  const { view } = await installed(harness);
  const other = await harness.principalFor((await harness.actor()).id);
  await harness.db
    .update(plugins)
    .set({ manifest: sql`${"{"}` })
    .where(eq(plugins.id, view.id));
  expect(await createPluginGrantTasksOf(databaseHandle(harness.db))(view.id, other.userId)).toBeNull();
});
