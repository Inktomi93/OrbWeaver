// @subject tests/support/node/showcase-bundle.ts
import { PLUGIN_MANIFEST_ENTRY } from "@orb/contracts/plugin";
import { parseBundle } from "@orb/server/domain/plugin";
import { SHOWCASE_PLUGIN_SLUGS, showcaseBundleEntries } from "@orb/showcase-plugins";
import type { ShowcaseRelease } from "@orb/tooling/plugin-author-showcase";
import { SHOWCASE_RELEASE_RECEIPT } from "@orb/tooling/plugin-author-showcase";
import { strToU8, zipSync } from "fflate";
import { expect, test } from "./fixtures.ts";
import { assertCurrentShowcaseBundle, committedShowcaseRelease, requireShowcaseBundle, SHOWCASE_BUILD_COMMAND } from "./showcase-bundle.ts";

const [SLUG] = SHOWCASE_PLUGIN_SLUGS;

// The built bundle with one entry replaced, as a build from older sources holds it.
function rebuiltWith(bundle: Uint8Array, path: string, text: string): Uint8Array {
  return zipSync({ ...showcaseBundleEntries(bundle), [path]: strToU8(text) });
}

// A stale bundle is refused with a message that names the bundle, the reason and the command that rebuilds it.
function expectRefused(bundle: Uint8Array, release: ShowcaseRelease, reason: string): void {
  const check = (): void => assertCurrentShowcaseBundle(SLUG, bundle, release);
  expect(check).toThrow(`"${SLUG}" is stale: ${reason};`);
  expect(check).toThrow(SHOWCASE_BUILD_COMMAND);
}

test("the build of the committed sources is current, and a build from older code is refused by name", async () => {
  const bundle = await requireShowcaseBundle(SLUG);
  const release = await committedShowcaseRelease();
  expect(() => assertCurrentShowcaseBundle(SLUG, bundle, release)).not.toThrow();

  const { mainJs, manifest } = parseBundle(bundle);
  const older = rebuiltWith(bundle, manifest.entry, `${mainJs}\n`);
  expectRefused(older, release, `the hashes of ${manifest.entry} differ from ${SHOWCASE_RELEASE_RECEIPT}`);
});

test("a bundle built before a manifest version change is refused with both versions and the build command", async () => {
  const bundle = await requireShowcaseBundle(SLUG);
  const release = await committedShowcaseRelease();
  const { manifest } = parseBundle(bundle);
  const olderVersion = "0.0.1";
  expect(release.versions[SLUG]).toBe(manifest.version);
  const older = rebuiltWith(bundle, PLUGIN_MANIFEST_ENTRY, JSON.stringify({ ...manifest, version: olderVersion }));
  expectRefused(older, release, `its manifest version ${olderVersion} is not the source manifest's ${manifest.version}`);
});
