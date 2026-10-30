// domain/settings/contract/portability — return shapes for the settings-domain theme import door.

/** The single-theme door's answer: the landed theme, or the parser's refusal as words. */
export type ImportThemeFileOutcome =
  | { readonly ok: true; readonly created: boolean; readonly name: string; readonly renamedFrom: string | null }
  | { readonly ok: false; readonly error: string };

export type { ImportedAppearance, ImportedAppearanceOutcome, ImportedThemeLanding, SettingsImportOutcome } from "@orb/contracts/settings";
