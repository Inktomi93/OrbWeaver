// What the Looks section says about the settings an imported SillyTavern theme carried that Orbweaver did not bring over.
// A zero-import leaf, so a spec's node side reads the sentences without loading the component graph.

/** The note's heading: how many of the file's settings were left behind, and on which theme. */
export function themeImportLeftoverTitle(themeName: string, count: number): string {
  return count === 1
    ? `1 SillyTavern setting in “${themeName}” wasn't brought over`
    : `${String(count)} SillyTavern settings in “${themeName}” weren't brought over`;
}

/** Why they were left and what survived, said once under the heading. */
export const THEME_IMPORT_LEFTOVER_GLOSS =
  "Orbweaver has no matching theme setting for them, or a text colour was too faint to read on its background. The rest of the theme imported.";

/** The disclosure trigger's name in each state. */
export function themeImportLeftoverToggleName(open: boolean): string {
  return open ? "Hide the settings" : "Show the settings";
}
