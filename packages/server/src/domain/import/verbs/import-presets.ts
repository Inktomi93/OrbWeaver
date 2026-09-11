// verb: importPresets — the ST preset wave of a whole-profile import. Each collected preset is ALREADY mapped
// to the orb-native portable file by the substrate; this verb's only work is serialize → hand to the preset
// domain's own injected `importPreset` op, with PER-PRESET ISOLATION.
//
// It deliberately owns NO write and NO collision rule: the preset domain's import verb is idempotent on
// (ownerId, name) and merges a same-named preset in place, which is what makes a re-run of a whole-profile
// import a clean no-op. Restating either here would be the banned parallel path — the same reason the chat
// wave delegates to `bulkImportChats` rather than touching @orb/db.

import type { PresetId } from "@orb/kit/ids";
import type { ImportContext } from "../context.ts";
import type { ImportPresetsResult } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";
import type { CollectedPreset, ImportPresetNote, ImportSkippedCard } from "../contract/views.ts";
import { requireProfile } from "../guard.ts";

const ENC = new TextEncoder();

/** One preset's lossiness note — emitted for EVERY imported preset, empty `fields` included, so the operator
 *  can tell "this landed whole" apart from "this was never looked at". */
function noteFor(p: CollectedPreset, scripts: { readonly created: number; readonly reused: number }): ImportPresetNote {
  return { name: p.parsed.name, sourceFile: p.sourceFile, fields: p.parsed.unmapped, scriptsLifted: scripts.created, scriptsReused: scripts.reused };
}

const NO_SCRIPTS = { created: 0, reused: 0 } as const;

/** Lift one imported preset's OWN regex scripts (ST presetManager extension field), attached to exactly the
 *  row the import op wrote. An unwired lift op or an outcome missing its row id is a RECORDED skip
 *  (per-preset isolation preserved), never a silent drop — the pre-lane state was precisely this plane
 *  vanishing without a report line. */
async function liftPresetScripts(args: {
  readonly ctx: ImportContext;
  readonly p: CollectedPreset;
  readonly presetId: PresetId | undefined;
  readonly skippedPresets: ImportSkippedCard[];
}): Promise<{ readonly created: number; readonly reused: number }> {
  const { ctx, p, presetId, skippedPresets } = args;
  const profile = requireProfile(ctx);
  if (p.parsed.regexScripts.length === 0) {
    return NO_SCRIPTS;
  }
  if (profile.importPresetScripts === undefined || presetId === undefined) {
    skippedPresets.push({
      file: p.sourceFile,
      reason: `${p.parsed.regexScripts.length} preset regex script(s) not lifted (the preset imported; the script lift is not wired into this composition)`,
    });
    return NO_SCRIPTS;
  }
  // PER-PRESET ISOLATION, the wave's stated contract: a THROWING lift used to reject `importPresets` whole,
  // discarding the counts and notes of every preset the run had already imported and handing the operator an
  // exception instead of a partial report (#1469 item 7). The preset itself landed; only its scripts did not,
  // and that is exactly one recorded skip.
  // @orb-waive caught-failure-ownership(err): bookkeeping — the failure is recorded into
  // `skippedPresets` (with the lift's own reason), part of the verb's own returned result. Ends if
  // `skippedPresets` stops being read by the caller.
  try {
    return await profile.importPresetScripts({ ownerId: ctx.ownerId, presetId, scripts: p.parsed.regexScripts });
  } catch (err) {
    // The last line of a prettified driver error is the actionable one — the same reason-shape the card wave
    // records ("UNIQUE constraint failed: …" rather than the whole stack).
    const message = err instanceof Error ? err.message : String(err);
    skippedPresets.push({
      file: p.sourceFile,
      reason: `${p.parsed.regexScripts.length} preset regex script(s) not lifted (the preset imported; the lift failed): ${message.split("\n").filter(Boolean).at(-1) ?? message}`,
    });
    return NO_SCRIPTS;
  }
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
      const scripts = await liftPresetScripts({ ctx, p, presetId: outcome.presetId, skippedPresets });
      notes.push(noteFor(p, scripts));
    }
    return { presetsImported, presetsCreated, skippedPresets, notes };
  }
  return { importPresets };
}
