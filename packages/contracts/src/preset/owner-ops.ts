// Preset owner operations other domains inject; the preset domain implements them and the composition root wires them.

import type { Cancellation } from "@orb/kit/guards";
import type { PresetId, UserId } from "@orb/kit/ids";
import type { PortableExportNotes, PortableFile } from "#portability";
import type { PresetImportOutcome } from "./portability.ts";

/** Export all of the owner's presets (excludes the shared, un-owned system default) as portable files. A preset whose
 *  stored config cannot be exported as the user's data is left out and reported to `note`. */
export type ExportPresets = (args: { readonly ownerId: UserId; readonly note: PortableExportNotes }) => Promise<PortableFile[]>;

/** Idempotent on (ownerId, name): merges an existing same-named preset in place, else creates fresh. */
export type ImportPreset = (args: { readonly ownerId: UserId; readonly bytes: Uint8Array }) => Promise<PresetImportOutcome>;

/** For each file, in order, whether the owner holds a preset {@link ImportPreset} would reuse for it. A read: it
 *  writes nothing, and it loads the owner's presets once for the whole list. An unreadable file answers `false`.
 *  Once `signal` aborts it stops and returns the answers so far, which the aborted caller discards. */
export type FindOwnedPresets = (args: {
  readonly ownerId: UserId;
  readonly files: readonly Uint8Array[];
  readonly signal: Cancellation;
}) => Promise<readonly boolean[]>;

/** Is `presetId` readable by `userId` (owned, or the shared system default)? */
export type PresetReadable = (presetId: PresetId, userId: UserId) => Promise<boolean>;

/** Copy one preset from `fromOwnerId`'s library into `toUserId`'s, verbatim. Returns the copy's id, or `null`
 *  when the source does not resolve under `fromOwnerId` (foreign, deleted, or the shared system default, which
 *  needs no copy). */
export type CopyPresetToUser = (args: { readonly fromOwnerId: UserId; readonly toUserId: UserId; readonly presetId: PresetId }) => Promise<PresetId | null>;
