import { spawn } from "node:child_process";
import type { PluginManifest } from "@orb/contracts/plugin";
import { pluginManifestSchema } from "@orb/contracts/plugin";
import { SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { nonEmpty, PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, makePluginBundle, requireShowcaseBundle, requireShowcaseManifest } from "@orb/testkit/node/composed";
import { strToU8 } from "fflate";

const WITHHELD = "research-familiar" satisfies (typeof SHOWCASE_PLUGIN_SLUGS)[number];
const ARCADE = "pocket-arcade" satisfies (typeof SHOWCASE_PLUGIN_SLUGS)[number];
const OLDER_VERSION = "0.0.0";
const SHOWCASE_COPY_URL = "https://plugins.example.test/showcase-copy.zip";

// A shipped slug at a version older than the bundle this build ships, built from the shipped manifest.
async function olderShowcaseBundle(slug: string, at: number): Promise<{ readonly manifest: PluginManifest; readonly bundle: Uint8Array }> {
  const manifest = pluginManifestSchema.parse({ ...(await requireShowcaseManifest(slug)), version: OLDER_VERSION });
  const ui = manifest.uiEntry === undefined ? {} : { [manifest.uiEntry]: strToU8("orb.ui(1);") };
  return { manifest, bundle: makePluginBundle(manifest, "orb.host(1);", at, ui) };
}

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
  expect(nonEmpty(installed).every((row) => row.grantedCapabilities.length === 0 && row.status === "disabled")).toBe(true);
  unavailable = false;
  await harness.app.examplePluginSeeder.ensureSeeded(caller);
  expect(await onboarding()).toEqual({ seeded: true, versions: await shippedVersions(SHOWCASE_PLUGIN_SLUGS) });
  const held = await harness.services.plugin.list({ caller });
  const oracle = installed.find((row) => row.slug === "oracle-deck");
  expect(held.find((row) => row.slug === "oracle-deck")?.id).toBe(oracle?.id);
  await harness.app.examplePluginSeeder.ensureSeeded(caller);
  expect(await harness.services.plugin.list({ caller })).toEqual(held);
});

test("the seeder adopts an unrecorded uploaded copy of a shipped slug but never a copy its owner installed from a URL", async () => {
  const [linked, uploaded] = SHOWCASE_PLUGIN_SLUGS;
  let served: Uint8Array | null = null;
  await using harness = await createServerHarness({
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]),
      fetch: () => (served === null ? Promise.reject(new Error("no bundle is served")) : Promise.resolve(new Response(Uint8Array.from(served)))),
    },
  });
  const user = (await harness.actor()).id;
  const caller = await harness.principalFor(user);
  const rpc = await harness.internalCallerFor(user);
  served = (await olderShowcaseBundle(linked, harness.clock.now())).bundle;
  const { bundleHash } = await rpc.plugin.previewFromUrl({ url: SHOWCASE_COPY_URL });
  const fromUrl = await rpc.plugin.installFromUrl({ url: SHOWCASE_COPY_URL, expectedBundleHash: bundleHash, grant: [] });
  const fromFile = await harness.services.plugin.install({ caller, bundle: (await olderShowcaseBundle(uploaded, harness.clock.now())).bundle, grant: [] });

  await harness.app.examplePluginSeeder.ensureSeeded(caller);
  const held = await harness.services.plugin.list({ caller });
  expect(held.find((row) => row.id === fromUrl.id)).toMatchObject({ slug: linked, origin: "url", sourceUrl: SHOWCASE_COPY_URL, version: OLDER_VERSION });
  expect(held.find((row) => row.id === fromFile.id)).toMatchObject({
    slug: uploaded,
    origin: "upload",
    version: (await requireShowcaseManifest(uploaded)).version,
  });
});

test("an enabled seeded copy whose shipped version newly asks for storage lands off, with the new ask standing and ungranted", { tags: ["slow"] }, async () => {
  // Enabling runs the real guest, so this root spawns the production plugin broker.
  await using harness = await createServerHarness({ pluginSpawn: spawn });
  const caller = await harness.principalFor((await harness.actor()).id);
  const shipped = await requireShowcaseManifest(ARCADE);
  // The prior release: the shipped manifest before it declared `storage.kv`, granted in full and turned on.
  const prior = pluginManifestSchema.parse({
    ...shipped,
    version: OLDER_VERSION,
    capabilities: shipped.capabilities.filter((capability) => capability !== "storage.kv"),
  });
  expect(shipped.capabilities).toContain("storage.kv");
  const held = await harness.services.plugin.install({
    caller,
    bundle: makePluginBundle(prior, "orb.host(1);", harness.clock.now()),
    grant: prior.capabilities,
  });
  await harness.services.plugin.setEnabled({ caller, pluginId: held.id, enabled: true });
  expect((await harness.services.plugin.list({ caller })).find((row) => row.id === held.id)).toMatchObject({ status: "enabled" });

  await harness.app.examplePluginSeeder.ensureSeeded(caller);
  expect((await harness.services.plugin.list({ caller })).find((row) => row.id === held.id)).toMatchObject({
    version: shipped.version,
    status: "disabled",
    reconsentPending: true,
    grantedCapabilities: prior.capabilities,
  });
});
