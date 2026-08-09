// verb: importThemes — the ST THEME wave of a whole-profile import. Each collected theme is ALREADY mapped to
// an orb `ThemeOverride` by the substrate; this verb's only work is serialize → hand to the settings domain's
// own injected `importTheme` op, with PER-THEME ISOLATION.
//
// It deliberately owns NO write and NO collision rule — the exact posture of `importPresets`. The settings
// domain's theme import is idempotent on (ownerId, name) and MERGES a same-named theme in place, which makes
// a re-run of a whole-profile import a clean no-op; restating that here would be the banned parallel path.
// SEED palettes cannot be touched by it either way (`ownerId IS NULL` rows are unreachable from an owned
// write), so orb's own defaults can never be overwritten — the brief's hard constraint holds structurally,
// not by convention.
//
// ONE FILE PER THEME, not one file for all of them. The op reports `created` for the WHOLE file, so batching
// N themes into one backup would collapse N outcomes into one bit and lose per-theme isolation: a single
// theme the settings domain refused would take the other N-1 with it.

import { buildThemeBackup } from "#kit/serde/theme";
import type { ImportContext } from "../context.ts";
import type { ImportThemesResult } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";
import type { CollectedTheme, ImportSkippedCard, ImportThemeNote } from "../contract/views.ts";
import { requireProfile } from "../guard.ts";

/** One theme's lossiness note — emitted for EVERY imported theme, empty `fields` included, so the operator can
 *  tell "this palette landed whole" apart from "this palette was never looked at". */
function noteFor(t: CollectedTheme): ImportThemeNote {
  return { name: t.parsed.name, sourceFile: t.sourceFile, fields: t.parsed.unmapped };
}

export function createImportThemes(ctx: ImportContext): Pick<ImportService, "importThemes"> {
  async function importThemes(input: { readonly themes: readonly CollectedTheme[] }): Promise<ImportThemesResult> {
    const profile = requireProfile(ctx);
    const importTheme = profile.importTheme;
    if (importTheme === undefined) {
      // Optional on the `importLorebook`/`importPreset` precedent: an unwired composition simply does not
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
    for (const t of input.themes) {
      const bytes = buildThemeBackup({ themes: [{ name: t.parsed.name, override: t.parsed.override, css: null }] });
      // biome-ignore lint/performance/noAwaitInLoops: themes are written sequentially during the one-time bulk import — each is one idempotent write, isolated per theme.
      const outcome = await importTheme(ctx.ownerId, bytes);
      if (!outcome.ok) {
        skippedThemes.push({ file: t.sourceFile, reason: outcome.error ?? "the settings domain refused the theme" });
        continue;
      }
      themesImported += 1;
      // Only a CREATE is net-new canon; a merge is the idempotent re-run path (the preset wave's line).
      if (outcome.created === true) {
        themesCreated += 1;
      }
      notes.push(noteFor(t));
    }
    return { themesImported, themesCreated, skippedThemes, notes };
  }
  return { importThemes };
}
