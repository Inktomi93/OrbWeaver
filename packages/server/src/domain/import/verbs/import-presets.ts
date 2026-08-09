// verb: importPresets — the ST preset wave of a whole-profile import. Each collected preset is ALREADY mapped
// to the orb-native portable file by the substrate; this verb's only work is serialize → hand to the preset
// domain's own injected `importPreset` op, with PER-PRESET ISOLATION.
//
// It deliberately owns NO write and NO collision rule: the preset domain's import verb is idempotent on
// (ownerId, name) and merges a same-named preset in place, which is what makes a re-run of a whole-profile
// import a clean no-op. Restating either here would be the banned parallel path — the same reason the chat
// wave delegates to `bulkImportChats` rather than touching @orb/db.

import type { ImportContext } from "../context.ts";
import type { ImportPresetsResult } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";
import type { CollectedPreset, ImportPresetNote, ImportSkippedCard } from "../contract/views.ts";
import { requireProfile } from "../guard.ts";

const ENC = new TextEncoder();

/** One preset's lossiness note — emitted for EVERY imported preset, empty `fields` included, so the operator
 *  can tell "this landed whole" apart from "this was never looked at". */
function noteFor(p: CollectedPreset): ImportPresetNote {
  return { name: p.parsed.name, sourceFile: p.sourceFile, fields: p.parsed.unmapped };
}

export function createImportPresets(ctx: ImportContext): Pick<ImportService, "importPresets"> {
  async function importPresets(input: { readonly presets: readonly CollectedPreset[] }): Promise<ImportPresetsResult> {
    const profile = requireProfile(ctx);
    const importPreset = profile.importPreset;
    if (importPreset === undefined) {
      // The op is optional on the ST-only precedent (`importLorebook`): an unwired composition simply does not
      // restore this plane. Reporting zero imported with every preset skipped-by-reason keeps that honest.
      return {
        presetsImported: 0,
        presetsCreated: 0,
        skippedPresets: input.presets.map((p): ImportSkippedCard => ({ file: p.sourceFile, reason: "preset import is not wired into this composition" })),
        notes: [],
      };
    }

    let presetsImported = 0;
    let presetsCreated = 0;
    const skippedPresets: ImportSkippedCard[] = [];
    const notes: ImportPresetNote[] = [];
    for (const p of input.presets) {
      // biome-ignore lint/performance/noAwaitInLoops: presets are written sequentially during the one-time bulk import — each is one idempotent write, isolated per preset.
      const outcome = await importPreset({ ownerId: ctx.ownerId, bytes: ENC.encode(JSON.stringify(p.parsed.file)) });
      if (!outcome.ok) {
        skippedPresets.push({ file: p.sourceFile, reason: outcome.error ?? "the preset domain refused the file" });
        continue;
      }
      presetsImported += 1;
      // Only a CREATE is net-new canon; a merge is the idempotent re-run path (see ImportPresetsResult).
      if (outcome.created === true) {
        presetsCreated += 1;
      }
      notes.push(noteFor(p));
    }
    return { presetsImported, presetsCreated, skippedPresets, notes };
  }
  return { importPresets };
}
