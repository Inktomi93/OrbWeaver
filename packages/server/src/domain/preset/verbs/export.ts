// verb: export (W-preset; export-import-portability.md §1) — the orb-NATIVE preset backup export: read ALL of
// the owner's OWN presets (the un-owned system default is excluded — it re-seeds on the target box) and emit
// one portable `orb.preset` JSON file per preset via the ONE preset codec (`@orb/contracts/preset`
// `buildPresetFile`). The stored blob is run through `parsePromptConfig` first (the lenient read-seam
// projection — lifts an older shape forward), exactly like every other preset read, so the export carries a
// current-version config. The RELATIONAL half (the owner-scoped read) lives HERE; the codec stays the serde.
//
// `import.ts` is the round-trip twin (the codec's `parsePresetFile` half). The filename slugs the preset name
// (`@orb/kit/slug`); the delivery-core registry descriptor prefixes the bundle `dir`.

import { buildPresetFile, parsePromptConfig } from "@orb/contracts/preset";
import { slugifyHandle } from "@orb/kit/slug";
import type { ExportPresets, PresetExportFile } from "../contract/portability";
import type { PresetContext } from "../contract/service";
import { listOwned } from "../persistence/queries";

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
