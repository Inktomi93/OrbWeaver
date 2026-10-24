// @subject packages/server/src/domain/plugin/seeder/showcase.ts
// @subject packages/server/src/domain/plugin/seeder/distributed.ts

import type { Principal } from "@orb/contracts/identity";
import { plugins } from "@orb/db";
import { packShowcaseBundle, SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, refuseWrites, requireShowcaseBundle } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

const SLUG = SHOWCASE_PLUGIN_SLUGS[0];

async function onboarding(
  root: ServerTestHarness,
  who: Principal,
): Promise<Awaited<ReturnType<ServerTestHarness["services"]["settings"]["getUserSettings"]>>["config"]["onboarding"]> {
  return (await root.services.settings.getUserSettings({ principal: who })).config.onboarding;
}

test("a missing real showcase bundle remains retryable, then lands owned, disabled and ungranted with a durable consent ask", async () => {
  await requireShowcaseBundle(SLUG);
  const source = { missing: true };
  await using root = await createServerHarness({ showcaseBundles: (slug) => (source.missing ? Promise.resolve(null) : packShowcaseBundle(slug)) });
  const { services } = root;
  const user = await root.actor();
  const actor = await principal(root, user.id);
  await root.app.examplePluginSeeder.ensureSeeded(actor);
  expect(await services.plugin.list({ caller: actor })).toEqual([]);
  expect((await onboarding(root, actor)).examplePluginsSeeded).toBe(false);
  source.missing = false;
  await root.app.examplePluginSeeder.ensureSeeded(actor);
  const rows = await services.plugin.list({ caller: actor });
  expect(rows.map((row) => row.slug).toSorted()).toEqual([...SHOWCASE_PLUGIN_SLUGS].toSorted());
  expect(rows.find((row) => row.slug === SLUG)).toMatchObject({ status: "disabled", grantedCapabilities: [], reconsentPending: true });
  expect(rows.every((row) => row.status === "disabled" && row.grantedCapabilities.length === 0 && row.reconsentPending)).toBe(true);
  expect((await onboarding(root, actor)).examplePluginsSeeded).toBe(true);
  const inbox = await services.notifications.list({ principal: actor });
  expect(
    inbox.items.some(
      (row) =>
        row.payload.type === "plugins-awaiting-consent" && row.payload.recipientUserId === user.id && row.payload.pendingCount === SHOWCASE_PLUGIN_SLUGS.length,
    ),
  ).toBe(true);
});

test("real showcase deletion survives a cold seed, while another account receives its own copy and provenance", async ({ harness, services, app, clock }) => {
  await requireShowcaseBundle(SLUG);
  const first = await harness.actor();
  const second = await harness.actor();
  const actor = await principal(harness, first.id);
  const neighbor = await principal(harness, second.id);
  await app.examplePluginSeeder.ensureSeeded(actor);
  const held = (await services.plugin.list({ caller: actor })).find((row) => row.slug === SLUG);
  if (held === undefined) {
    throw new Error("the real showcase install did not land");
  }
  await services.plugin.uninstall({ caller: actor, pluginId: held.id });
  // A restarted server on the same database is the cold seed: its seeder has settled no pass in this process.
  await using restarted = await createServerHarness({ db: harness.db, ownerId: harness.ownerId, clock, ids: harness.ids });
  await restarted.app.examplePluginSeeder.ensureSeeded(await restarted.principalFor(first.id));
  expect((await services.plugin.list({ caller: actor })).map((row) => row.slug)).not.toContain(SLUG);
  await app.examplePluginSeeder.ensureSeeded(neighbor);
  expect((await services.plugin.list({ caller: neighbor })).map((row) => row.slug)).toContain(SLUG);
  expect((await onboarding(harness, neighbor)).seededPluginVersions[SLUG]).toBe(held.version);
});

test("a failed real distributed install never latches; retry stays recipient-scoped, deduplicates in flight and respects withdrawal", async ({
  harness,
  db,
  services,
  app,
  clock,
}) => {
  const publisher = await harness.actor({ role: "admin" });
  const admin = await principal(harness, publisher.id);
  const bundle = await requireShowcaseBundle(SLUG);
  await services.plugin.installForAllUsers({ caller: admin, bundle });
  const recipient = await harness.actor();
  const actor = await principal(harness, recipient.id);
  const apply = vi.spyOn(services.plugin, "applyDistributedPlugins");
  await using refusal = await refuseWrites(db, { table: plugins, event: "INSERT", message: "recipient install refused" });
  await expect(app.distributedPluginApplier.ensureApplied(actor)).resolves.toBeUndefined();
  expect((await onboarding(harness, actor)).distributedPluginsApplied).toBe(false);
  expect(await services.plugin.list({ caller: actor })).toEqual([]);
  await refusal.lift();
  const pending = app.distributedPluginApplier.ensureApplied(actor);
  expect(app.distributedPluginApplier.ensureApplied(actor)).toBe(pending);
  await pending;
  const held = (await services.plugin.list({ caller: actor }))[0];
  if (held === undefined) {
    throw new Error("the real distributed retry did not land");
  }
  expect(held).toMatchObject({ slug: SLUG, status: "disabled", grantedCapabilities: [], reconsentPending: true });
  expect(apply.mock.calls.map(([args]) => args.caller)).toEqual([actor, actor]);
  await services.plugin.uninstall({ caller: actor, pluginId: held.id });
  await using restarted = await createServerHarness({ db, ownerId: harness.ownerId, clock, ids: harness.ids });
  await restarted.app.distributedPluginApplier.ensureApplied(await restarted.principalFor(recipient.id));
  expect(await services.plugin.list({ caller: actor })).toEqual([]);
});
