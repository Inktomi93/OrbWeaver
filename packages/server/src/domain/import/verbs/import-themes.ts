// verb: importThemes — the ST THEME wave of a whole-profile import. Each collected theme is ALREADY mapped to
// an orb `ThemeOverride` by the substrate; this verb's only work is serialize → hand the list to the settings
// domain's own injected `importThemes` batch op, the one the dry run asks too.
//
// It deliberately owns NO write and NO collision rule — the exact posture of `importPresets`. The settings
// domain's theme import reuses an equal theme, which makes a re-run of a whole-profile import a clean no-op;
// restating that here would be the banned parallel path. SEED palettes cannot be touched by it either way
// (`ownerId IS NULL` rows are unreachable from an owned write), so orb's own defaults can never be overwritten —
// the brief's hard constraint holds structurally, not by convention.
//
// ONE FILE PER THEME, not one file for all of them. The op reports `created` per FILE, so packing N themes into
// one backup would collapse N outcomes into one bit and lose per-theme isolation: a single theme the settings
// domain refused would take the other N-1 with it.

import type { Cancellation } from "@orb/kit/guards";
import type { CollectedTheme } from "../contract/collection.ts";
import type { ImportSkippedCard, ImportThemeNote, ImportThemesResult } from "../contract/results.ts";
import type { ImportContext, ImportService } from "../contract/service.ts";
import { requireProfile } from "../guard.ts";
import { themeBytes } from "../substrate/landing-bytes.ts";

/** One theme's lossiness note — emitted for EVERY imported theme, empty `fields` included, so the operator can
 *  tell "this palette landed whole" apart from "this palette was never looked at". */
function noteFor(t: CollectedTheme, landed: { readonly name: string; readonly renamedFrom: string | null } | undefined): ImportThemeNote {
  const where = landed ?? { name: t.parsed.name, renamedFrom: null };
  return { name: where.name, renamedFrom: where.renamedFrom, sourceFile: t.sourceFile, fields: t.parsed.unmapped };
}

export function createImportThemes(ctx: ImportContext): Pick<ImportService, "importThemes"> {
  async function importThemeWave(input: { readonly themes: readonly CollectedTheme[]; readonly signal: Cancellation }): Promise<ImportThemesResult> {
    const profile = requireProfile(ctx);
    const importThemes = profile.importThemes;
    if (importThemes === undefined) {
      // Optional on the `importLorebook`/`importPresets` precedent: an unwired composition simply does not
      // restore this plane. Reporting zero imported with every theme skipped-by-reason keeps that honest.
      return {
        themesImported: 0,
        themesCreated: 0,
        skippedThemes: input.themes.map((t): ImportSkippedCard => ({ file: t.sourceFile, reason: "theme import is not wired into this composition" })),
        notes: [],
      };
    }

    let themesImported = 0;
    let themesCreated = 0;
    const skippedThemes: ImportSkippedCard[] = [];
    const notes: ImportThemeNote[] = [];
    const files = input.themes.map((t) => ({ bytes: themeBytes(t) }));
    const outcomes = await importThemes({ ownerId: ctx.ownerId, files, dryRun: false, signal: input.signal });
    for (const [i, t] of input.themes.entries()) {
      const outcome = outcomes[i];
      // An aborted batch stops short; the themes after it were never attempted.
      if (outcome === undefined) {
        break;
      }
      if (!outcome.ok) {
        skippedThemes.push({ file: t.sourceFile, reason: outcome.error });
        continue;
      }
      themesImported += 1;
      // Only a CREATE is net-new canon; a reused equal theme is the idempotent re-run path (the preset wave's line).
      if (outcome.created === true) {
        themesCreated += 1;
      }
      notes.push(noteFor(t, outcome.landed?.[0]));
    }
    return { themesImported, themesCreated, skippedThemes, notes };
  }
  return { importThemes: importThemeWave };
}
