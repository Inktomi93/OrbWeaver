// domain/settings/contract/portability — return shapes for the settings-domain theme import door.

import type { SettingsImportOutcome } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";

/** The theme import op every door calls: the bundle descriptor, the profile import and the single-file door.
 *  `fallbackName` names a raw SillyTavern theme that carries no `name` (the picked file's stem). */
export type ImportTheme = (ownerId: UserId, bytes: Uint8Array, fallbackName?: string) => Promise<SettingsImportOutcome>;

/** The single-theme door's answer: the landed theme, or the parser's refusal as words. */
export type ImportThemeFileOutcome =
  | { readonly ok: true; readonly created: boolean; readonly name: string; readonly renamedFrom: string | null }
  | { readonly ok: false; readonly error: string };

export type { ImportedAppearance, ImportedAppearanceOutcome, ImportedThemeLanding, SettingsImportOutcome } from "@orb/contracts/settings";
