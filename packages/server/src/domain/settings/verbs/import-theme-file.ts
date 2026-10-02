// verb: importThemeFile — the single-theme import door, a thin arm over the SAME `importTheme` op the backup
// bundle and the profile import call, so every door reads one parser and one collision rule.

import { fileStem } from "@orb/kit/strings";
import type { ImportThemeFileParams } from "../contract/params.ts";
import type { ImportTheme, ImportThemeFileOutcome } from "../contract/portability.ts";
import type { SettingsService } from "../contract/service.ts";

const ENC = new TextEncoder();

export function createImportThemeFile(deps: { readonly importTheme: ImportTheme }): Pick<SettingsService, "importThemeFile"> {
  async function importThemeFile({ principal, fileText, filename }: ImportThemeFileParams): Promise<ImportThemeFileOutcome> {
    const stem = filename === undefined ? "" : fileStem(filename);
    const outcome = await deps.importTheme(principal.userId, ENC.encode(fileText), stem.length > 0 ? stem : undefined);
    if (!outcome.ok) {
      return { ok: false, error: outcome.error ?? "That file isn't a theme." };
    }
    const first = outcome.landed?.[0];
    if (first === undefined) {
      return { ok: false, error: "The file carries no theme." };
    }
    return { ok: true, created: first.created, name: first.name, renamedFrom: first.renamedFrom };
  }
  return { importThemeFile };
}
