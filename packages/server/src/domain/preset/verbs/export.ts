// verb: export — the orb-native preset backup export: read all of the owner's own presets (the un-owned
// system default is excluded — it re-seeds on the target box) and emit one portable orb.preset JSON file
// per preset via buildPresetFile. import.ts is the round-trip twin (parsePresetFile).

import { buildPresetFile, parsePromptConfig } from "@orb/contracts/preset";
import { slugifyHandle } from "@orb/kit/slug";
import type { PresetContext } from "../context.ts";
import type { ExportPresets, PresetExportFile } from "../contract/portability.ts";
import { listOwned } from "../persistence/queries.ts";

export function createExport(ctx: PresetContext): ExportPresets {
  return async ({ ownerId }): Promise<PresetExportFile[]> => {
    const rows = await listOwned(ctx.db, ownerId);
    return rows.map((row): PresetExportFile => {
      const file = buildPresetFile(row.name, parsePromptConfig(row.config));
      return {
        filename: `${slugifyHandle(row.name)}.json`,
        bytes: new TextEncoder().encode(JSON.stringify(file)),
      };
    });
  };
}
