// The boot seeder (lives at the domain root, not a subsystem folder — a sanctioned root singleton in
// the server layout test). `ensureSystemDefaultPreset` makes the single `ownerId IS NULL` row
// exist, and is `schemaVersion`-gated on reseed: when the stored row's version is below
// `DEFAULT_PROMPT_CONFIG.schemaVersion`, the row is overwritten with the current default — a version
// bump is the ONLY reseed trigger (a direct DB config edit that doesn't bump the version survives). The
// clock is injected for determinism (entry passes the real clock).

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import { SYSTEM_DEFAULT_PRESET_ID, SYSTEM_DEFAULT_PRESET_KIND, SYSTEM_DEFAULT_PRESET_NAME } from "./constants.ts";
import { insertPreset, selectSystemDefault } from "./persistence/queries.ts";
import { reseedSystemDefault } from "./persistence/system-default.ts";

export async function ensureSystemDefaultPreset(handle: DatabaseHandle, now: () => number, logger: Logger): Promise<void> {
  const db = databaseForOwner(handle);
  const existing = await selectSystemDefault(db);

  if (existing === undefined) {
    const at = now();
    await insertPreset(db, {
      id: SYSTEM_DEFAULT_PRESET_ID,
      ownerId: null,
      name: SYSTEM_DEFAULT_PRESET_NAME,
      kind: SYSTEM_DEFAULT_PRESET_KIND,
      config: DEFAULT_PROMPT_CONFIG,
      schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
      // The seeded root is the lineage FLOOR — every fork points AT it, it points at nothing.
      forkedFrom: null,
      createdAt: at,
      updatedAt: at,
    });
    getLog(logger).info({ presetId: SYSTEM_DEFAULT_PRESET_ID }, "preset: seeded system default");
    return;
  }

  if (existing.schemaVersion < DEFAULT_PROMPT_CONFIG.schemaVersion) {
    await reseedSystemDefault(db, now());
    getLog(logger).info(
      {
        presetId: SYSTEM_DEFAULT_PRESET_ID,
        from: existing.schemaVersion,
        to: DEFAULT_PROMPT_CONFIG.schemaVersion,
      },
      "preset: reseeded system default (schemaVersion bump)",
    );
  }
}
