import type { z } from "zod";
import type { importLandingSchema, PortableImportOutcome } from "../portability/index.ts";
import type { BackgroundLibraryEntry } from "./appearance.ts";

/** The `appearance` half of a foreign-profile import (today: the SillyTavern profile importer). Two planes in
 *  ONE write because both land in the same JSON namespace and the array plane needs a read-modify-write that
 *  must not race a sibling patch — the settings owner serializes the combined write.
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

/** Where one theme in a file landed ({@link importLandingSchema}). */
export type ImportedThemeLanding = Readonly<z.output<typeof importLandingSchema>>;

/** Never throws for a malformed file, so one bad entry can't abort a bundle. `landed` is the theme import's
 *  per-theme accounting (absent on the user-settings import). */
export type SettingsImportOutcome =
  | (Extract<PortableImportOutcome, { readonly ok: true }> & { readonly landed?: readonly ImportedThemeLanding[] })
  | (Extract<PortableImportOutcome, { readonly ok: false }> & { readonly landed?: never });
