import { SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, requireShowcaseBundle, requireShowcaseManifest } from "@orb/testkit/node/composed";

const WITHHELD = "research-familiar" satisfies (typeof SHOWCASE_PLUGIN_SLUGS)[number];

async function shippedVersions(slugs: readonly string[]): Promise<Readonly<Record<string, string>>> {
  return Object.fromEntries(await Promise.all(slugs.map(async (slug) => [slug, (await requireShowcaseManifest(slug)).version] as const)));
}

test("missing bundles retry without latching while only installed versions advance real provenance", async () => {
  let unavailable = true;
  await using harness = await createServerHarness({
    showcaseBundles: (slug) => (unavailable && slug === WITHHELD ? Promise.resolve(null) : requireShowcaseBundle(slug)),
  });
  const caller = await harness.principalFor((await harness.actor()).id);
  const onboarding = async (): Promise<{ readonly seeded: boolean; readonly versions: Readonly<Record<string, string>> }> => {
    const { examplePluginsSeeded, seededPluginVersions } = (await harness.services.settings.getUserSettings({ principal: caller })).config.onboarding;
    return { seeded: examplePluginsSeeded, versions: seededPluginVersions };
  };
  await harness.app.examplePluginSeeder.ensureSeeded(caller);
  const installedSlugs = SHOWCASE_PLUGIN_SLUGS.filter((slug) => slug !== WITHHELD);
  expect(await onboarding()).toEqual({ seeded: false, versions: await shippedVersions(installedSlugs) });
  const installed = await harness.services.plugin.list({ caller });
  expect(installed.map((row) => row.slug).toSorted()).toEqual(installedSlugs.toSorted());
  expect(installed.every((row) => row.grantedCapabilities.length === 0 && row.status === "disabled")).toBe(true);
  unavailable = false;
  await harness.app.examplePluginSeeder.ensureSeeded(caller);
  expect(await onboarding()).toEqual({ seeded: true, versions: await shippedVersions(SHOWCASE_PLUGIN_SLUGS) });
  const held = await harness.services.plugin.list({ caller });
  const oracle = installed.find((row) => row.slug === "oracle-deck");
  expect(held.find((row) => row.slug === "oracle-deck")?.id).toBe(oracle?.id);
  await harness.app.examplePluginSeeder.ensureSeeded(caller);
  expect(await harness.services.plugin.list({ caller })).toEqual(held);
});
