// The AppSettings floor-merge moved config resolution into the settings domain's
// effective-config/ subsystem (core/Tier-2-Foundation.md "does NOT own"). This tier
// keeps only the one thing that isn't a setting: APP_VERSION.

import { readFileSync } from "node:fs";

interface PackageManifest {
  version: string;
}

// Three levels up from src/foundation/config to packages/server, where package.json lives.
const manifest = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as PackageManifest;

/** The `@orb/server` package version. */
export const APP_VERSION: string = manifest.version;
