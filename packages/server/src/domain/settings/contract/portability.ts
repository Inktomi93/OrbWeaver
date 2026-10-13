// domain/settings/contract/portability — return shapes for the settings-domain portable entities (theme +
// user-settings) export/import verbs. These structurally match @orb/contracts/portability's PortableFile/
// PortableImportOutcome but this file deliberately does not import that contract — the entity-agnostic
// registry is composed at the entry root.

import type { SettingsImportOutcome } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";

export interface SettingsPortableFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** The theme import op every door calls: the bundle descriptor, the profile import and the single-file door.
 *  `fallbackName` names a raw SillyTavern theme that carries no `name` (the picked file's stem). */
export type ImportTheme = (ownerId: UserId, bytes: Uint8Array, fallbackName?: string) => Promise<SettingsImportOutcome>;

/** The single-theme door's answer: the landed theme, or the parser's refusal as words. */
export type ImportThemeFileOutcome =
  | { readonly ok: true; readonly created: boolean; readonly name: string; readonly renamedFrom: string | null }
  | { readonly ok: false; readonly error: string };

export type { ImportedAppearance, ImportedAppearanceOutcome, ImportedThemeLanding, SettingsImportOutcome } from "@orb/contracts/settings";
