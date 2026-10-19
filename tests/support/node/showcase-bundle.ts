// The release-built showcase bundles are gitignored build output; a test that needs one names the build step instead of failing on a downstream symptom.
import type { PluginManifest } from "@orb/contracts/plugin";
import { packShowcaseBundle, readShowcaseManifest } from "@orb/showcase-plugins";

const BUILD_COMMAND = "pnpm --filter @orb/showcase-plugins build";

function absent(slug: string): Error {
  return new Error(`the release-built showcase bundle "${slug}" is missing; run \`${BUILD_COMMAND}\` before this test`);
}

/** The exact release-built zip bytes of one showcase plugin. */
export async function requireShowcaseBundle(slug: string): Promise<Uint8Array> {
  const bundle = await packShowcaseBundle(slug);
  if (bundle === null) {
    throw absent(slug);
  }
  return bundle;
}

/** The manifest read from the release-built zip of one showcase plugin. */
export async function requireShowcaseManifest(slug: string): Promise<PluginManifest> {
  const manifest = await readShowcaseManifest(slug);
  if (manifest === null) {
    throw absent(slug);
  }
  return manifest;
}
