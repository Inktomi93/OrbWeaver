// verb: export — the orb-native preset export: the backup's every owned preset (the un-owned system default is
// excluded — it re-seeds on the target box) and the Presets page's one readable preset, each as one portable
// orb.preset JSON file through `presetFileOf`, so both doors write the same bytes. import.ts is the round-trip twin.
// A file carries the preset's attached regex scripts in run order, read from the owner's own rows, so a restore
// attaches them again.
// A preset whose stored config reads only as the default stand-in is left out and reported to the caller's `note`:
// a backup must never present defaults as the user's preset, and one such row must not cost the rest of the backup.

import type { PortableExportNote, PortableFile } from "@orb/contracts/portability";
import { PORTABLE_EXPORT_CARRY } from "@orb/contracts/portability";
import type { ExportPresets } from "@orb/contracts/preset";
import { buildPresetFile, promptConfigConfig } from "@orb/contracts/preset";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { slugifyHandle } from "@orb/kit/slug";
import { exportableStoredConfig, refuseExportNote, STORED_CONFIG_UNREADABLE } from "#primitives/stored-config";
import { PresetNotFoundError } from "../contract/errors.ts";
import type { PresetContext, PresetService } from "../contract/service.ts";
import { listOwned, readablePreset } from "../persistence/queries.ts";

type PresetScripts = Awaited<ReturnType<PresetContext["exportPresetScripts"]>>;
type PresetRow = Awaited<ReturnType<typeof listOwned>>[number];

// One preset's portable file, or what `unreadable` answers when its stored config cannot be exported as the user's data.
function presetFileOf<Skip>(row: PresetRow, scripts: PresetScripts, unreadable: (note: PortableExportNote) => Skip): PortableFile | Skip {
  const config = exportableStoredConfig(promptConfigConfig.parseOutcome(row.config, row.schemaVersion));
  if (!config.carried) {
    return unreadable({ kind: "preset", item: row.name, code: STORED_CONFIG_UNREADABLE, failure: config.failure, carried: PORTABLE_EXPORT_CARRY.leftOut });
  }
  const file = buildPresetFile(row.name, config.value, scripts.get(row.id) ?? []);
  return { filename: `${slugifyHandle(row.name)}.json`, bytes: new TextEncoder().encode(JSON.stringify(file)) };
}

export function createExportPresets(input: DbAssemblyInput<PresetContext>): ExportPresets {
  const ctx: PresetContext = { ...input, db: databaseForOwner(input.db) };
  return async ({ ownerId, note }): Promise<PortableFile[]> => {
    const scripts = await ctx.exportPresetScripts({ ownerId });
    return (await listOwned(ctx.db, ownerId)).flatMap((row) =>
      presetFileOf(row, scripts, (left): readonly PortableFile[] => {
        note(left);
        return [];
      }),
    );
  };
}

export function createExportFile(ctx: PresetContext): Pick<PresetService, "exportFile"> {
  async function exportFile({ userId, id }: Parameters<PresetService["exportFile"]>[0]): ReturnType<PresetService["exportFile"]> {
    const row = await readablePreset(ctx.db, userId, id);
    if (row === undefined) {
      throw new PresetNotFoundError(id);
    }
    // One preset has nothing else to deliver, so a config it cannot carry as stored refuses it, naming the preset.
    const file = presetFileOf(row, await ctx.exportPresetScripts({ ownerId: userId }), refuseExportNote);
    return { filename: file.filename, fileText: new TextDecoder().decode(file.bytes) };
  }
  return { exportFile };
}
