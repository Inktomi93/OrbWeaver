// domain/settings/contract/portability — return shapes for the settings-domain theme import door.

/** The single-theme door's answer: the landed theme with the ST keys the file left behind, or the parser's refusal as words. */
export type ImportThemeFileOutcome =
  | { readonly ok: true; readonly created: boolean; readonly name: string; readonly renamedFrom: string | null; readonly unmapped: readonly string[] }
  | { readonly ok: false; readonly error: string };
