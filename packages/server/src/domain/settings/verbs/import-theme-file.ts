// verb: importThemeFile — the single-theme import door, a batch of one through the SAME `importThemes` op the backup
// bundle and the profile import call, so every door reads one parser and one collision rule.

import type { ImportThemes } from "@orb/contracts/settings";
import { fileStem } from "@orb/kit/strings";
import { NEVER_ABORTED, soleResult } from "#primitives/abort";
import type { ImportThemeFileParams } from "../contract/params.ts";
import type { ImportThemeFileOutcome } from "../contract/portability.ts";
import type { SettingsService } from "../contract/service.ts";

const ENC = new TextEncoder();

export function createImportThemeFile(deps: { readonly importThemes: ImportThemes }): Pick<SettingsService, "importThemeFile"> {
  async function importThemeFile({ principal, fileText, filename }: ImportThemeFileParams): Promise<ImportThemeFileOutcome> {
    const stem = filename === undefined ? "" : fileStem(filename);
    const file = { bytes: ENC.encode(fileText), ...(stem.length > 0 ? { fallbackName: stem } : {}) };
    const outcome = soleResult(await deps.importThemes({ ownerId: principal.userId, files: [file], dryRun: false, signal: NEVER_ABORTED }));
    if (!outcome.ok) {
      return { ok: false, error: outcome.error };
    }
    const first = outcome.landed?.[0];
    if (first === undefined) {
      return { ok: false, error: "The file carries no theme." };
    }
    return { ok: true, created: first.created, name: first.name, renamedFrom: first.renamedFrom, unmapped: first.unmapped };
  }
  return { importThemeFile };
}
