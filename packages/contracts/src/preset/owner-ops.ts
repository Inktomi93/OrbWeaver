// Preset owner operations other domains inject; the preset domain implements them and the composition root wires them.

import type { PresetId, UserId } from "@orb/kit/ids";
import type { PortableFile } from "#portability";
import type { PresetImportOutcome } from "./portability.ts";

/** Export all of the owner's presets (excludes the shared, un-owned system default) as portable files. */
export type ExportPresets = (args: { readonly ownerId: UserId }) => Promise<PortableFile[]>;

/** Idempotent on (ownerId, name): merges an existing same-named preset in place, else creates fresh. */
export type ImportPreset = (args: { readonly ownerId: UserId; readonly bytes: Uint8Array }) => Promise<PresetImportOutcome>;

/** Is `presetId` readable by `userId` (owned, or the shared system default)? */
export type PresetReadable = (presetId: PresetId, userId: UserId) => Promise<boolean>;

/** Copy one preset from `fromOwnerId`'s library into `toUserId`'s, verbatim. Returns the copy's id, or `null`
 *  when the source does not resolve under `fromOwnerId` (foreign, deleted, or the shared system default, which
 *  needs no copy). */
export type CopyPresetToUser = (args: { readonly fromOwnerId: UserId; readonly toUserId: UserId; readonly presetId: PresetId }) => Promise<PresetId | null>;
