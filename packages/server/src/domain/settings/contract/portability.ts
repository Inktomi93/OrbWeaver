// domain/settings/contract/portability — return shapes for the settings-domain portable entities (theme +
// user-settings) export/import verbs. These structurally match @orb/contracts/portability's PortableFile/
// PortableImportOutcome but this file deliberately does not import that contract — the entity-agnostic
// registry is composed at the entry root.

import type { BackgroundLibraryEntry } from "@orb/contracts/settings";

export interface SettingsPortableFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** Never throws for a malformed file, so one bad entry can't abort a bundle. */
export interface SettingsImportOutcome {
  readonly ok: boolean;
  readonly created?: boolean;
  readonly error?: string;
}

/** The `appearance` half of a foreign-profile import (today: the SillyTavern profile importer). Two planes in
 *  ONE write because both land in the same JSON namespace and the array plane needs a read-modify-write that
 *  must not race a sibling patch — see `verbs/apply-imported-appearance.ts`.
 *  `patch` is an opaque partial `appearance` blob (the `updateUserSettingsSection` contract: the caller maps,
 *  the lenient parser is the enforcement); `backgroundLibrary` entries are APPENDED, never replacing. */
export interface ImportedAppearance {
  readonly patch: Record<string, unknown>;
  readonly backgroundLibrary: readonly BackgroundLibraryEntry[];
}

/** What one {@link ImportedAppearance} write actually changed — the import report's raw material. */
export interface ImportedAppearanceOutcome {
  /** Library entries genuinely appended (an assetId already in the library is a re-run no-op). */
  readonly backgroundsAdded: number;
  /** The `appearance` keys the patch carried (empty when the profile named none, or when a value was
   *  already applied by an earlier profile dir in the same run). */
  readonly patchedKeys: readonly string[];
}
