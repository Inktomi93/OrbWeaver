// verb: importFile — the SINGLE-preset import door (redesign §16.1 G6), and nothing more than a door. It
// DELEGATES to `createImport` (verbs/import.ts), the same `ImportPreset` arm the whole-profile portability
// bundle uses, so the single-file path inherits the bundle's semantics BY CONSTRUCTION rather than restating
// them: strict parse with a contained per-file error, idempotent on `(ownerId, name)` (a same-named preset is
// MERGED in place, else created under kind `roleplay`), lift-walk from the file's own schemaVersion, and the
// `presetsChanged` emit. A second serde or a second collision rule here would be the banned parallel path.
//
// The door's only work is text → bytes: an `orb.preset` file IS UTF-8 JSON text, and the verb's first act is
// a UTF-8 decode, so this re-encode is a no-op that keeps ONE decode home.

import type { ImportPresetFileParams } from "../contract/params.ts";
import type { ImportPreset, PresetImportOutcome } from "../contract/portability.ts";
import type { PresetService } from "../contract/service.ts";

/** `importPreset` is INJECTED (verb-to-verb value imports are the banned edge — `domain-no-cross-verb`):
 *  service.ts builds `createImport(ctx)` once and hands it here, which is also what makes "the door owns no
 *  semantics" structural rather than a claim. */
export function createImportFile(deps: { readonly importPreset: ImportPreset }): Pick<PresetService, "importFile"> {
  function importFile(params: ImportPresetFileParams): Promise<PresetImportOutcome> {
    return deps.importPreset({ ownerId: params.userId, bytes: new TextEncoder().encode(params.fileText) });
  }
  return { importFile };
}
