// The boot seeder (lives at the domain root, not a subsystem folder — a sanctioned root singleton in
// the feature-structure gate). `ensureSystemDefaultPreset` makes the single `ownerId IS NULL` row
// exist, and is `schemaVersion`-gated on reseed: when the stored row's version is below
// `DEFAULT_PROMPT_CONFIG.schemaVersion`, the row is overwritten with the current default — a version
// bump is the ONLY reseed trigger (a direct DB config edit that doesn't bump the version survives). The
// clock is injected for determinism (entry passes the real clock).

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { getLog } from "#foundation/observability";
import { SYSTEM_DEFAULT_PRESET_ID, SYSTEM_DEFAULT_PRESET_KIND, SYSTEM_DEFAULT_PRESET_NAME } from "./constants";
import type { PackagedPreset } from "./contract/packaged";
import { PACKAGED_PRESETS } from "./contract/packaged";
import { insertPreset, reseedPackagedPreset, reseedSystemDefault, selectPackagedPreset, selectSystemDefault } from "./persistence/queries";

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

  if (existing.schemaVersion < DEFAULT_PROMPT_CONFIG.schemaVersion) {
    await reseedSystemDefault(db, DEFAULT_PROMPT_CONFIG, DEFAULT_PROMPT_CONFIG.schemaVersion, now());
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

/** Ensure every shipped PACKAGED template preset (ownerless, well-known id) exists. Mirrors the system-default
 *  seeder: first boot inserts each row; a stored `schemaVersion` below the registry config's version forces a
 *  reseed (re-stamping name/kind/config). Idempotent across boots — a version bump is the ONLY reseed trigger.
 *  These rows are clone sources (`clonePackaged`), deliberately kept OUT of the readable list. */
export async function ensurePackagedPresets(db: Db, now: () => number): Promise<void> {
  // Each key is an independent well-known-id row (distinct ids, no ordering) — seed in parallel.
  await Promise.all(Object.entries(PACKAGED_PRESETS).map(([key, template]) => ensureOnePackagedPreset(db, key, template, now)));
}

async function ensureOnePackagedPreset(db: Db, key: string, template: PackagedPreset, now: () => number): Promise<void> {
  const existing = await selectPackagedPreset(db, template.id);
  const version = template.config.schemaVersion;

  if (existing === undefined) {
    const at = now();
    await insertPreset(db, {
      id: template.id,
      ownerId: null,
      name: template.name,
      kind: template.kind,
      config: template.config,
      schemaVersion: version,
      createdAt: at,
      updatedAt: at,
    });
    getLog().info({ presetId: template.id, packagedKey: key }, "preset: seeded packaged");
    return;
  }

  if (existing.schemaVersion < version) {
    await reseedPackagedPreset(db, template.id, {
      name: template.name,
      kind: template.kind,
      config: template.config,
      schemaVersion: version,
      updatedAt: now(),
    });
    getLog().info({ presetId: template.id, packagedKey: key, from: existing.schemaVersion, to: version }, "preset: reseeded packaged (schemaVersion bump)");
  }
}
