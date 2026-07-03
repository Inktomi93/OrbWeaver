// domain/settings/effective-config/cache — the in-memory resolved-config cache + the reload seam (the
// read-side twin of `updateAppSettings`). `getEffectiveConfig()` is SYNC (hot paths — engine/embedder/
// runners — must not do a per-call DB read); `reloadEffectiveConfig(db)` runs at boot + after every admin
// write and rebuilds the cache from the stored override. The `logger.level` rebind on reload is LOAD-
// BEARING: Pino captures `level` at construction, so without it the `AppSettings.logLevel` override would
// be a docs-only knob (effective only at restart). This is the ONE sanctioned higher-tier write into a
// foundation singleton (domain → foundation is downward, legal).
//
// ASSUMES(single-replica): the cache is module-scope, per-process — an admin write busts only THIS
// process's copy (true per the one-image deploy invariant). The DB `"app"` row is the documented
// multi-replica seam if that is ever reversed. Before the first reload, the cache is the env-only floor.

import type { EffectiveAppConfig } from "@orb/contracts/settings";
import { parseAppSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { logger } from "#foundation/observability";
import { readAppOverrideRaw } from "../persistence/queries";
import { layer } from "./layer";

// ASSUMES(single-replica): module-scope, per-process (cleared by restart). Lazily seeded to the env-only
// floor on first read so a hot path before boot's reload still gets the safe default.
let cache: EffectiveAppConfig | undefined;

/** The resolved runtime config (SYNC). Before the first `reloadEffectiveConfig`, this is the env-only
 *  floor (`layer({})`) — the safe default. */
export function getEffectiveConfig(): EffectiveAppConfig {
  cache ??= layer({});
  return cache;
}

/** Re-read the stored override blob and rebuild the cache; rebind `logger.level`. Call at boot + after
 *  every admin write. The in-blob `schemaVersion` probe is authoritative for AppSettings (no version
 *  column), so `parseAppSettings` takes no `storedVersion`. */
export async function reloadEffectiveConfig(db: Db): Promise<EffectiveAppConfig> {
  const raw = await readAppOverrideRaw(db);
  const resolved = layer(parseAppSettings(raw ?? {}));
  cache = resolved;
  // The load-bearing rebind — without it `AppSettings.logLevel` is effective only at restart. Cheap.
  logger.level = resolved.logLevel;
  return resolved;
}

/** @internal — test seam: drop the cache so the next read re-derives from the env floor (the same shape
 *  the foundation singletons expose; isolate:true already gives a fresh module per test FILE). */
export function __resetEffectiveConfigCache(): void {
  cache = undefined;
}
