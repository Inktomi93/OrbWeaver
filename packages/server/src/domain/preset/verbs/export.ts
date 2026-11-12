// verb: export — the orb-native preset backup export: read all of the owner's own presets (the un-owned
// system default is excluded — it re-seeds on the target box) and emit one portable orb.preset JSON file
// per preset via buildPresetFile. import.ts is the round-trip twin (parsePresetFile).
// A preset whose stored config cannot be read refuses the export (`stored_config_unreadable`): the lenient read's
// stand-in is the default config, and a backup must never present defaults as the user's preset.

import type { PortableFile } from "@orb/contracts/portability";
import type { ExportPresets } from "@orb/contracts/preset";
import { buildPresetFile, promptConfigConfig } from "@orb/contracts/preset";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { slugifyHandle } from "@orb/kit/slug";
import { requireIntactStoredConfig, STORED_CONFIG_REFUSALS } from "#primitives/stored-config";
import type { PresetContext } from "../contract/service.ts";
import { listOwned } from "../persistence/queries.ts";

export function createExportPresets(input: DbAssemblyInput<PresetContext>): ExportPresets {
  const ctx: PresetContext = { ...input, db: databaseForOwner(input.db) };
  return async ({ ownerId }): Promise<PortableFile[]> => {
    const rows = await listOwned(ctx.db, ownerId);
    return rows.map((row): PortableFile => {
      const config = requireIntactStoredConfig(
        promptConfigConfig.parseOutcome(row.config, row.schemaVersion),
        `presets.config for ${row.id}`,
        STORED_CONFIG_REFUSALS.export,
      );
      const file = buildPresetFile(row.name, config);
      return {
        filename: `${slugifyHandle(row.name)}.json`,
        bytes: new TextEncoder().encode(JSON.stringify(file)),
      };
    });
  };
}
