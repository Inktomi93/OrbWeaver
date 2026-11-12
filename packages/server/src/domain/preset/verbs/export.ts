// verb: export — the orb-native preset backup export: read all of the owner's own presets (the un-owned
// system default is excluded — it re-seeds on the target box) and emit one portable orb.preset JSON file
// per preset via buildPresetFile. import.ts is the round-trip twin (parsePresetFile).
// A preset whose stored config reads only as the default stand-in is left out and reported to the caller's `note`:
// a backup must never present defaults as the user's preset, and one such row must not cost the rest of the backup.

import type { PortableFile } from "@orb/contracts/portability";
import { PORTABLE_EXPORT_CARRY } from "@orb/contracts/portability";
import type { ExportPresets } from "@orb/contracts/preset";
import { buildPresetFile, promptConfigConfig } from "@orb/contracts/preset";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { slugifyHandle } from "@orb/kit/slug";
import { exportableStoredConfig, STORED_CONFIG_UNREADABLE } from "#primitives/stored-config";
import type { PresetContext } from "../contract/service.ts";
import { listOwned } from "../persistence/queries.ts";

export function createExportPresets(input: DbAssemblyInput<PresetContext>): ExportPresets {
  const ctx: PresetContext = { ...input, db: databaseForOwner(input.db) };
  return async ({ ownerId, note }): Promise<PortableFile[]> => {
    const rows = await listOwned(ctx.db, ownerId);
    return rows.flatMap((row): PortableFile[] => {
      const config = exportableStoredConfig(promptConfigConfig.parseOutcome(row.config, row.schemaVersion));
      if (!config.carried) {
        note({ kind: "preset", item: row.name, code: STORED_CONFIG_UNREADABLE, failure: config.failure, carried: PORTABLE_EXPORT_CARRY.leftOut });
        return [];
      }
      const file = buildPresetFile(row.name, config.value);
      return [{ filename: `${slugifyHandle(row.name)}.json`, bytes: new TextEncoder().encode(JSON.stringify(file)) }];
    });
  };
}
