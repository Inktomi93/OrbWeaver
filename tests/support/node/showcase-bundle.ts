// The release-built showcase bundles are gitignored build output; a test that needs one names the build step instead of
// failing on a downstream symptom. A bundle is current when its manifest version is the source manifest's and its
// entries hash to the committed release receipt, which every build rewrites. Neither check sees a source edit committed
// without its rebuilt receipt: the receipt then agrees with the stale build, and only the showcase package's
// `check:artifacts` script, which compiles the sources, can tell.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { PluginManifest } from "@orb/contracts/plugin";
import { parseBundle } from "@orb/server/domain/plugin";
import { packShowcaseBundle, readShowcaseManifest, SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { REPO_ROOT } from "@orb/tooling/floor/artifacts/artifacts";
import type { ShowcaseRelease } from "@orb/tooling/plugin-author-showcase";
import { loadShowcaseRelease, SHOWCASE_RELEASE_RECEIPT, showcaseReleaseReceipt } from "@orb/tooling/plugin-author-showcase";

/** The command that rebuilds every showcase bundle from its sources. */
export const SHOWCASE_BUILD_COMMAND = "pnpm --filter @orb/showcase-plugins build";
const REBUILD = `run \`${SHOWCASE_BUILD_COMMAND}\` before this test`;

function absent(slug: string): Error {
  return new Error(`the release-built showcase bundle "${slug}" is missing; ${REBUILD}`);
}

// Why `bundle` is not the build of the committed showcase sources `release` reads, or null when it is.
function staleReason(slug: string, bundle: Uint8Array, release: ShowcaseRelease): string | null {
  const shipped = SHOWCASE_PLUGIN_SLUGS.find((known) => known === slug);
  if (shipped === undefined) {
    return "no showcase plugin carries that slug";
  }
  const [built, source] = [parseBundle(bundle).manifest.version, release.versions[slug]];
  if (built !== source) {
    return `its manifest version ${built} is not the source manifest's ${source ?? "(none)"}`;
  }
  const hashes = showcaseReleaseReceipt([{ slug: shipped, bytes: bundle }]).bundles[slug] ?? {};
  const committed = release.receipt.bundles[slug] ?? {};
  if (isDeepStrictEqual(hashes, committed)) {
    return null;
  }
  const differing = [...new Set([...Object.keys(hashes), ...Object.keys(committed)])].filter((path) => hashes[path] !== committed[path]).toSorted();
  return `the hashes of ${differing.join(", ")} differ from ${SHOWCASE_RELEASE_RECEIPT}`;
}

/** The committed receipt and source manifest versions of the working tree. */
export function committedShowcaseRelease(): Promise<ShowcaseRelease> {
  return loadShowcaseRelease((path) => readFile(join(REPO_ROOT, path), "utf8"));
}

/** Refuse a built bundle that is not the build of the committed sources, naming the bundle, why and the build command. */
export function assertCurrentShowcaseBundle(slug: string, bundle: Uint8Array, release: ShowcaseRelease): void {
  const stale = staleReason(slug, bundle, release);
  if (stale !== null) {
    throw new Error(`the release-built showcase bundle "${slug}" is stale: ${stale}; ${REBUILD}`);
  }
}

/** The exact release-built zip bytes of one showcase plugin, refused when they are not the build of the committed sources. */
export async function requireShowcaseBundle(slug: string): Promise<Uint8Array> {
  const bundle = await packShowcaseBundle(slug);
  if (bundle === null) {
    throw absent(slug);
  }
  assertCurrentShowcaseBundle(slug, bundle, await committedShowcaseRelease());
  return bundle;
}

/** The manifest read from the release-built zip of one showcase plugin, refused as {@link requireShowcaseBundle} refuses. */
export async function requireShowcaseManifest(slug: string): Promise<PluginManifest> {
  await requireShowcaseBundle(slug);
  const manifest = await readShowcaseManifest(slug);
  if (manifest === null) {
    throw absent(slug);
  }
  return manifest;
}
