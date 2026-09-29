// @orb/showcase-plugins is the runtime index over release-built first-party plugin bundles. The authored
// TypeScript, manifests, and assets live under bundles/; the server never reads that source tree and never
// loads the author compiler. `pnpm build` produces one deterministic, installable zip per slug under
// dist/bundles/, and the Docker/runtime package copy carries those ignored artifacts beside this module.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_MANIFEST_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { unzipSync } from "fflate";

export const SHOWCASE_PLUGIN_SLUGS = [
  "research-familiar",
  "oracle-deck",
  "affinity-tracker",
  "draft-polish",
  "scene-chips",
  "story-clocks",
  "pocket-arcade",
  "keepsake-camera",
  "card-atlas",
] as const;

export const SHOWCASE_BUNDLE_DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "bundles");

/** The installable entries of a release-built showcase bundle. */
export function showcaseBundleEntries(bytes: Uint8Array): Readonly<Record<string, Uint8Array>> {
  return unzipSync(bytes);
}

export interface ShowcaseBundleReader {
  readonly packBundle: (slug: string) => Promise<Uint8Array | null>;
  readonly readManifest: (slug: string) => Promise<PluginManifest | null>;
}

export function createShowcaseBundleReader(bundleDirectory: string): ShowcaseBundleReader {
  const packBundle = async (slug: string): Promise<Uint8Array | null> => {
    try {
      return new Uint8Array(await readFile(join(bundleDirectory, `${slug}.zip`)));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  };

  return {
    packBundle,
    readManifest: async (slug: string): Promise<PluginManifest | null> => {
      const bundle = await packBundle(slug);
      if (bundle === null) {
        return null;
      }
      const raw = unzipSync(bundle)[PLUGIN_MANIFEST_ENTRY];
      if (raw === undefined) {
        throw new Error(`showcase bundle ${slug} has no manifest`);
      }
      return pluginManifestSchema.parse(JSON.parse(new TextDecoder().decode(raw)));
    },
  };
}

const shipped = createShowcaseBundleReader(SHOWCASE_BUNDLE_DIST_DIR);

/** Read the exact release-built zip bytes consumed by the normal install and upgrade funnels. */
export const packShowcaseBundle = shipped.packBundle;

/** Read the manifest from the exact release-built zip, rather than from the author source tree. */
export const readShowcaseManifest = shipped.readManifest;
