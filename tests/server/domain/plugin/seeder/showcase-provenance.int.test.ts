import { createExamplePluginSeeder, createPluginSeedOps, createShowcaseVersionReader } from "@orb/server/domain/plugin";
import { createSettingsComposedOps } from "@orb/server/domain/settings";
import { expect, test } from "@orb/testkit/node";
import { requireShowcaseBundle, requireShowcaseManifest } from "@orb/testkit/node/composed";

test("missing bundles retry without latching while only installed versions advance real provenance", async ({ harness }) => {
  const caller = await harness.principalFor((await harness.actor()).id);
  const ops = createPluginSeedOps(harness.services.plugin);
  const settings = createSettingsComposedOps(harness.services.settings);
  let unavailable = true;
  const seed = createExamplePluginSeeder({
    slugs: ["oracle-deck", "research-familiar"],
    packBundle: (slug) => (unavailable && slug === "research-familiar" ? Promise.resolve(null) : requireShowcaseBundle(slug)),
    bundledVersion: createShowcaseVersionReader(requireShowcaseManifest),
    install: ops.install,
    requestConsent: ops.requestConsent,
    upgrade: ops.upgrade,
    listHeld: ops.listHeld,
    isSeeded: settings.isExamplePluginSeeded,
    markSeeded: settings.markExamplePluginSeeded,
    readSeededVersions: settings.readSeededPluginVersions,
    writeSeededVersions: settings.writeSeededPluginVersions,
  });
  await seed.ensureSeeded(caller);
  const oracle = await requireShowcaseManifest("oracle-deck");
  expect(await settings.isExamplePluginSeeded(caller)).toBe(false);
  expect(await settings.readSeededPluginVersions(caller)).toEqual({ "oracle-deck": oracle.version });
  const installed = await harness.services.plugin.list({ caller });
  expect(installed).toMatchObject([{ slug: "oracle-deck", grantedCapabilities: [], status: "disabled" }]);
  unavailable = false;
  await seed.ensureSeeded(caller);
  const research = await requireShowcaseManifest("research-familiar");
  expect(await settings.isExamplePluginSeeded(caller)).toBe(true);
  expect(await settings.readSeededPluginVersions(caller)).toEqual({ "oracle-deck": oracle.version, "research-familiar": research.version });
  const held = await harness.services.plugin.list({ caller });
  expect(held.find((row) => row.slug === "oracle-deck")?.id).toBe(installed[0]?.id);
  await seed.ensureSeeded(caller);
  expect(await harness.services.plugin.list({ caller })).toEqual(held);
});
