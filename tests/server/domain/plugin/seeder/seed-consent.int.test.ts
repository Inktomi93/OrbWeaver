// @subject packages/server/src/domain/plugin/seeder/showcase.ts
// @subject packages/server/src/domain/plugin/seeder/distributed.ts

import { plugins } from "@orb/db";
import { createDistributedPluginApplier, createExamplePluginSeeder, createPluginSeedOps } from "@orb/server/domain/plugin";
import { createSettingsComposedOps } from "@orb/server/domain/settings";
import { packShowcaseBundle, readShowcaseManifest, SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { expect, test } from "@orb/testkit/node";
import { refuseWrites, requireShowcaseBundle } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

const SLUG = SHOWCASE_PLUGIN_SLUGS[0];

test("a missing real showcase bundle remains retryable, then lands owned, disabled and ungranted with a durable consent ask", async ({ harness, services }) => {
  await requireShowcaseBundle(SLUG);
  const user = await harness.actor();
  const actor = await principal(harness, user.id);
  const source = { missing: true };
  const pluginOps = createPluginSeedOps(services.plugin);
  const settingsOps = createSettingsComposedOps(services.settings);
  const seeder = createExamplePluginSeeder({
    slugs: [SLUG],
    packBundle: (slug) => (source.missing ? Promise.resolve(null) : packShowcaseBundle(slug)),
    bundledVersion: async (slug) => (await readShowcaseManifest(slug))?.version ?? null,
    install: pluginOps.install,
    upgrade: pluginOps.upgrade,
    requestConsent: pluginOps.requestConsent,
    listHeld: pluginOps.listHeld,
    isSeeded: settingsOps.isExamplePluginSeeded,
    markSeeded: settingsOps.markExamplePluginSeeded,
    readSeededVersions: settingsOps.readSeededPluginVersions,
    writeSeededVersions: settingsOps.writeSeededPluginVersions,
  });
  await seeder.ensureSeeded(actor);
  expect(await services.plugin.list({ caller: actor })).toEqual([]);
  expect(await settingsOps.isExamplePluginSeeded(actor)).toBe(false);
  source.missing = false;
  await seeder.ensureSeeded(actor);
  const rows = await services.plugin.list({ caller: actor });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ slug: SLUG, status: "disabled", grantedCapabilities: [], reconsentPending: true });
  expect(await settingsOps.isExamplePluginSeeded(actor)).toBe(true);
  const inbox = await services.notifications.list({ principal: actor });
  expect(
    inbox.items.some((row) => row.payload.type === "plugins-awaiting-consent" && row.payload.recipientUserId === user.id && row.payload.pendingCount === 1),
  ).toBe(true);
});

test("real showcase deletion survives a cold seed, while another account receives its own copy and provenance", async ({ harness, services }) => {
  await requireShowcaseBundle(SLUG);
  const first = await harness.actor();
  const second = await harness.actor();
  const actor = await principal(harness, first.id);
  const neighbor = await principal(harness, second.id);
  const pluginOps = createPluginSeedOps(services.plugin);
  const settingsOps = createSettingsComposedOps(services.settings);
  const deps = {
    slugs: [SLUG],
    packBundle: packShowcaseBundle,
    bundledVersion: async (slug: string) => (await readShowcaseManifest(slug))?.version ?? null,
    install: pluginOps.install,
    upgrade: pluginOps.upgrade,
    requestConsent: pluginOps.requestConsent,
    listHeld: pluginOps.listHeld,
    isSeeded: settingsOps.isExamplePluginSeeded,
    markSeeded: settingsOps.markExamplePluginSeeded,
    readSeededVersions: settingsOps.readSeededPluginVersions,
    writeSeededVersions: settingsOps.writeSeededPluginVersions,
  };
  const seeder = createExamplePluginSeeder(deps);
  await seeder.ensureSeeded(actor);
  const held = (await services.plugin.list({ caller: actor }))[0];
  if (held === undefined) {
    throw new Error("the real showcase install did not land");
  }
  await services.plugin.uninstall({ caller: actor, pluginId: held.id });
  await createExamplePluginSeeder(deps).ensureSeeded(actor);
  expect(await services.plugin.list({ caller: actor })).toEqual([]);
  await seeder.ensureSeeded(neighbor);
  expect(await services.plugin.list({ caller: neighbor })).toMatchObject([{ slug: SLUG }]);
  expect(await settingsOps.readSeededPluginVersions(neighbor)).toEqual({ [SLUG]: held.version });
});

test("a failed real distributed install never latches; retry stays recipient-scoped, deduplicates in flight and respects withdrawal", async ({
  harness,
  db,
  services,
}) => {
  const publisher = await harness.actor({ role: "admin" });
  const admin = await principal(harness, publisher.id);
  const bundle = await requireShowcaseBundle(SLUG);
  await services.plugin.installForAllUsers({ caller: admin, bundle });
  const recipient = await harness.actor();
  const actor = await principal(harness, recipient.id);
  const settingsOps = createSettingsComposedOps(services.settings);
  const pluginOps = createPluginSeedOps(services.plugin);
  const apply = vi.fn(pluginOps.apply);
  const deps = { apply, isApplied: settingsOps.isDistributedPluginApplied, markApplied: settingsOps.markDistributedPluginApplied };
  const applier = createDistributedPluginApplier(deps);
  await using refusal = await refuseWrites(db, { table: plugins, event: "INSERT", message: "recipient install refused" });
  await expect(applier.ensureApplied(actor)).resolves.toBeUndefined();
  expect(await settingsOps.isDistributedPluginApplied(actor)).toBe(false);
  expect(await services.plugin.list({ caller: actor })).toEqual([]);
  await refusal.lift();
  const pending = applier.ensureApplied(actor);
  expect(applier.ensureApplied(actor)).toBe(pending);
  await pending;
  const held = (await services.plugin.list({ caller: actor }))[0];
  if (held === undefined) {
    throw new Error("the real distributed retry did not land");
  }
  expect(held).toMatchObject({ slug: SLUG, status: "disabled", grantedCapabilities: [], reconsentPending: true });
  expect(apply.mock.calls.map(([p]) => p)).toEqual([actor, actor]);
  await services.plugin.uninstall({ caller: actor, pluginId: held.id });
  await createDistributedPluginApplier(deps).ensureApplied(actor);
  expect(await services.plugin.list({ caller: actor })).toEqual([]);
});
