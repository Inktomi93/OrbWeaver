// verb: importPresets — the ST preset wave of a whole-profile import. Each collected preset is ALREADY mapped
// to the orb-native portable file by the substrate; this verb's only work is serialize → hand the whole list to the
// preset domain's own injected `importPresets` batch op, the one the dry run asks too, then lift each landed
// preset's scripts with PER-PRESET ISOLATION.
//
// It deliberately owns NO write and NO collision rule: the preset domain's batch reuses an equal preset, which is
// what makes a re-run of a whole-profile import a clean no-op. Restating either here would be the banned parallel
// path — the same reason the chat wave delegates to `bulkImportChats` rather than touching @orb/db.

import { clipImportText } from "@orb/contracts/import";
import type { ImportCardScriptsResult } from "@orb/contracts/regex";
import type { Cancellation } from "@orb/kit/guards";
import type { PresetId } from "@orb/kit/ids";
import type { CollectedPreset } from "../contract/collection.ts";
import type { ImportPresetNote, ImportPresetsResult, ImportSkippedCard } from "../contract/results.ts";
import type { ImportContext, ImportService } from "../contract/service.ts";
import { requireProfile } from "../guard.ts";
import { presetImportFile } from "../substrate/landing-bytes.ts";

/** One preset's lossiness note — emitted for EVERY imported preset, empty `fields` included, so the operator
 *  can tell "this landed whole" apart from "this was never looked at". */
function noteFor(
  p: CollectedPreset,
  landed: { readonly name: string; readonly renamedFrom: string | null; readonly created: boolean },
  scripts: ImportCardScriptsResult,
): ImportPresetNote {
  return {
    name: landed.name,
    renamedFrom: landed.renamedFrom,
    sourceFile: p.sourceFile,
    // A script refused at the write door is named in the preset's own note, beside the fields that did not map.
    fields: [
      ...p.parsed.unmapped,
      ...[...scripts.refused, ...p.parsed.refusedScripts].map((refusal) => ({
        field: SCRIPTS_FIELD,
        reason: `script ${JSON.stringify(clipImportText(refusal.name))} not imported: ${refusal.reason}`,
      })),
    ],
    scriptsLifted: scripts.created,
    scriptsReused: scripts.reused,
    // A reused preset already holds the sections, so the run added none.
    addedSections: landed.created ? p.parsed.addedSections : [],
  };
}

const NO_SCRIPTS: ImportCardScriptsResult = { created: 0, reused: 0, refused: [] };
// Where a preset carries its scripts on the SillyTavern wire, which is where its note names a refused one.
const SCRIPTS_FIELD = "extensions.regex_scripts";

/** Lift one imported preset's OWN regex scripts (ST presetManager extension field), attached to exactly the
 *  row the import op wrote. An unwired lift op or an outcome missing its row id is a RECORDED skip
 *  (per-preset isolation preserved), never a silent drop — the pre-lane state was precisely this plane
 *  vanishing without a report line. */
async function liftPresetScripts(args: {
  readonly ctx: ImportContext;
  readonly p: CollectedPreset;
  readonly presetId: PresetId | undefined;
  readonly skippedPresets: ImportSkippedCard[];
}): Promise<ImportCardScriptsResult> {
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
  // exception instead of a partial report. The preset itself landed; only its scripts did not,
  // and that is exactly one recorded skip.
  // the catch pushes the lift's reason onto `skippedPresets`, the
  // array `importPresets` returns in `ImportPresetsResult.skippedPresets`. Ends if that array stops being returned.
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
  async function importPresetWave(input: { readonly presets: readonly CollectedPreset[]; readonly signal: Cancellation }): Promise<ImportPresetsResult> {
    const profile = requireProfile(ctx);
    const importPresets = profile.importPresets;
    if (importPresets === undefined) {
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
    const outcomes = await importPresets({ ownerId: ctx.ownerId, files: input.presets.map(presetImportFile), dryRun: false, signal: input.signal });
    for (const [i, p] of input.presets.entries()) {
      const outcome = outcomes[i];
      // An aborted batch stops short; the presets after it were never attempted.
      if (outcome === undefined) {
        break;
      }
      if (!outcome.ok) {
        skippedPresets.push({ file: p.sourceFile, reason: outcome.error });
        continue;
      }
      presetsImported += 1;
      // Only a CREATE is net-new canon; a reused equal preset is the idempotent re-run path.
      if (outcome.created === true) {
        presetsCreated += 1;
      }
      const scripts = await liftPresetScripts({ ctx, p, presetId: outcome.presetId, skippedPresets });
      notes.push(noteFor(p, { name: outcome.name ?? p.parsed.name, renamedFrom: outcome.renamedFrom ?? null, created: outcome.created === true }, scripts));
    }
    return { presetsImported, presetsCreated, skippedPresets, notes };
  }
  return { importPresets: importPresetWave };
}
