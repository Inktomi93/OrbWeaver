// domain/preset/seed — the boot seeder (preset.md §"Named subsystems: none" — the seeder lives at the
// domain root, not a subsystem folder). `ensureSystemDefaultPreset` makes the single `ownerId IS NULL` row
// exist, and is `schemaVersion`-GATED on reseed (esoteric #3): when the stored row's version is BELOW
// `DEFAULT_PROMPT_CONFIG.schemaVersion`, the row is overwritten with the current default — a version bump is
// the ONLY reseed trigger (a direct DB config edit that doesn't bump the version survives; a version bump
// overwrites it on the next boot). The clock is INJECTED for determinism (entry passes the real clock).

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { getLog } from "#foundation/observability";
import {
  SYSTEM_DEFAULT_PRESET_ID,
  SYSTEM_DEFAULT_PRESET_KIND,
  SYSTEM_DEFAULT_PRESET_NAME,
} from "./constants";
import { insertPreset, reseedSystemDefault, selectSystemDefault } from "./persistence/queries";

export async function ensureSystemDefaultPreset(db: Db, now: () => number): Promise<void> {
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
      createdAt: at,
      updatedAt: at,
    });
    getLog().info({ presetId: SYSTEM_DEFAULT_PRESET_ID }, "preset: seeded system default");
    return;
  }

  // Version-gated reseed: a bump to DEFAULT_PROMPT_CONFIG.schemaVersion forces an overwrite on next boot.
  if (existing.schemaVersion < DEFAULT_PROMPT_CONFIG.schemaVersion) {
    await reseedSystemDefault(
      db,
      DEFAULT_PROMPT_CONFIG,
      DEFAULT_PROMPT_CONFIG.schemaVersion,
      now(),
    );
    getLog().info(
      {
        presetId: SYSTEM_DEFAULT_PRESET_ID,
        from: existing.schemaVersion,
        to: DEFAULT_PROMPT_CONFIG.schemaVersion,
      },
      "preset: reseeded system default (schemaVersion bump)",
    );
  }
}
