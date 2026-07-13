// domain/preset/contract/portability — the orb-native preset backup op types. Preset's export/import verbs
// read + write the domain's own `presets` table directly, over the already-built preset codec
// (buildPresetFile/parsePresetFile in @orb/contracts/preset).
//
// Result shapes are structurally the delivery-core PortableFile/PortableImportOutcome so the entry-root
// registry descriptor composes them without a mapping layer.

import type { UserId } from "@orb/kit/ids";

export interface PresetExportFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** ok:false + error for a malformed upload (never thrown); created:false when merged into an existing preset. */
export interface PresetImportOutcome {
  readonly ok: boolean;
  readonly created?: boolean;
  readonly error?: string;
}

/** Export all of the owner's presets (excludes the shared, un-owned system default) as portable files. */
export type ExportPresets = (args: { readonly ownerId: UserId }) => Promise<PresetExportFile[]>;

/** Idempotent on (ownerId, name): merges an existing same-named preset in place, else creates fresh. */
export type ImportPreset = (args: {
  readonly ownerId: UserId;
  readonly bytes: Uint8Array;
}) => Promise<PresetImportOutcome>;
