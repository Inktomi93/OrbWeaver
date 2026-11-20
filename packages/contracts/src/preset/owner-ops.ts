// Preset owner operations other domains inject; the preset domain implements them and the composition root wires them.

import type { Cancellation } from "@orb/kit/guards";
import type { PresetId, UserId } from "@orb/kit/ids";
import type { ImportAnswer } from "#import";
import type { PortableExportNotes, PortableFile } from "#portability";
import type { RegexScriptCard } from "#regex";
import type { PresetImportOutcome } from "./portability.ts";

/** Export all of the owner's presets (excludes the shared, un-owned system default) as portable files. A preset whose
 *  stored config cannot be exported as the user's data is left out and reported to `note`. */
export type ExportPresets = (args: { readonly ownerId: UserId; readonly note: PortableExportNotes }) => Promise<PortableFile[]>;

/** One preset file of an import batch, and the scripts its caller attaches to the preset it lands as. A file without
 *  `regexScripts` does not speak for scripts, and its preset is compared by its config alone. */
export interface PresetImportFile {
  readonly bytes: Uint8Array;
  readonly regexScripts?: readonly RegexScriptCard[];
}

interface PresetImportBatch {
  readonly ownerId: UserId;
  readonly files: readonly PresetImportFile[];
  readonly signal: Cancellation;
}

/** Land preset files in the owner's library, additively and in order: a preset whose content equals an owned one, or
 *  one an earlier file of the batch lands, reuses that row; a different one under a taken name lands under the next
 *  free name. A preset's content is its config and, for a file that carries them, its scripts in their run order,
 *  less any the script write door refuses, against the scripts an owned preset holds. A single-file door is a batch
 *  of one. With `dryRun` it writes nothing and answers, per file, what the write does with it (`"library"`, `"upload"`
 *  or `null` for a new row) with the preset's content keys, so a preview is the write's own decision. An unreadable file is a refusal outcome, or a `null` answer with no key. Once `signal`
 *  aborts it stops after the file in hand and returns what it has. */
export interface ImportPresets {
  (args: PresetImportBatch & { readonly dryRun: true }): Promise<readonly ImportAnswer[]>;
  (args: PresetImportBatch & { readonly dryRun: false }): Promise<readonly PresetImportOutcome[]>;
}

/** Is `presetId` readable by `userId` (owned, or the shared system default)? */
export type PresetReadable = (presetId: PresetId, userId: UserId) => Promise<boolean>;

/** Copy one preset from `fromOwnerId`'s library into `toUserId`'s, verbatim. Returns the copy's id, or `null`
 *  when the source does not resolve under `fromOwnerId` (foreign, deleted, or the shared system default, which
 *  needs no copy). */
export type CopyPresetToUser = (args: { readonly fromOwnerId: UserId; readonly toUserId: UserId; readonly presetId: PresetId }) => Promise<PresetId | null>;
