// foundation/config — what genuinely remains of the config tier after the AppSettings floor-merge folded
// into the settings DOMAIN (settings.md / tiers/foundation.md "does NOT own"): constants. The lone
// resident is `version` (`APP_VERSION`), read DOWN by `observability/tracing` (the service.version resource
// attr) + `observability/debug` (/api/_debug/info). NO `app-config.ts` / `layer()` / `EffectiveAppConfig`
// lives here — that resolver is the settings domain's `effective-config/` subsystem.

import { readFileSync } from "node:fs";

interface PackageManifest {
  version: string;
}

// `@orb/server`'s own package.json sits three directories up from this module's dir
// (src/foundation/config → src/foundation → src → packages/server).
const manifest = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as PackageManifest;

/** The running app version (the `@orb/server` package version). A pure constant read DOWN by tracing
 *  (service.version) + the /api/_debug/info surface. */
export const APP_VERSION: string = manifest.version;
