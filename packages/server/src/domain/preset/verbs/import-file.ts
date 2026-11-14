// verb: importFile — the SINGLE-preset import door (redesign §16.1 G6), and nothing more than a door: a batch of
// one through `createImportPresets` (verbs/import.ts), the same `ImportPresets` op the whole-profile import and the
// portability bundle use, so the single-file path inherits their semantics BY CONSTRUCTION rather than restating
// them: strict parse with a contained per-file error, additive by content (an equal preset is reused, a same-named
// different one lands beside it under kind `roleplay`), lift-walk from the file's own schemaVersion, and the
// `presetsChanged` emit. A second serde or a second collision rule here would be the banned parallel path.
//
// The door's only work is text → bytes: an `orb.preset` file IS UTF-8 JSON text, and the verb's first act is
// a UTF-8 decode, so this re-encode is a no-op that keeps ONE decode home.

import type { ImportPresets, PresetImportOutcome } from "@orb/contracts/preset";
import { NEVER_ABORTED, soleResult } from "#primitives/abort";
import type { ImportPresetFileParams } from "../contract/params.ts";
import type { PresetService } from "../contract/service.ts";

/** `importPresets` is INJECTED (verb-to-verb value imports are the banned edge — `domain-no-cross-verb`):
 *  service.ts builds `createImportPresets(ctx)` once and hands it here, which is also what makes "the door owns no
 *  semantics" structural rather than a claim. */
export function createImportFile(deps: { readonly importPresets: ImportPresets }): Pick<PresetService, "importFile"> {
  async function importFile(params: ImportPresetFileParams): Promise<PresetImportOutcome> {
    const files = [new TextEncoder().encode(params.fileText)];
    return soleResult(await deps.importPresets({ ownerId: params.userId, files, dryRun: false, signal: NEVER_ABORTED }));
  }
  return { importFile };
}
