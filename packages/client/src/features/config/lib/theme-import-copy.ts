// What the Looks section says about the settings an imported SillyTavern theme carried that Orbweaver's themes have no field for.
// A leaf module, so a spec's node side reads the sentences without loading the component graph.
//
// The words follow what the person has to do. A display choice is theirs to set in Appearance (the settings it names, by their
// own labels); a key with no counterpart here needs nothing; a text colour dropped as too faint is already covered by Orbweaver's
// own readable colour. The sentence for each group is keyed on the wire's reason kind, so a new kind fails `tsc` until it has one.

import type { ThemeLeftoverReasonKind } from "@orb/contracts/portability";

function settingsCount(count: number): string {
  return count === 1 ? "1 SillyTavern setting" : `${String(count)} SillyTavern settings`;
}

/** The note's heading. An import that landed says what was left out of it; a reuse (nothing was created) says the file's settings
 *  have no theme field, and never claims an import. */
export function themeImportLeftoverTitle(themeName: string, count: number, created: boolean): string {
  return created
    ? `${settingsCount(count)} in “${themeName}” ${count === 1 ? "wasn't" : "weren't"} brought over`
    : `${settingsCount(count)} in this file ${count === 1 ? "isn't" : "aren't"} part of a theme here`;
}

/** The first line under the heading: what happened to the rest of the file. */
export const THEME_IMPORT_OUTCOME: Record<"created" | "reused", string> = {
  created: "The rest of the theme imported.",
  reused: "Nothing changed, because you already have this theme.",
};

/** Whether the person has anything to do: they do when a display setting is among the leftovers. */
export const THEME_IMPORT_ACTION: Record<"needed" | "none", string> = {
  needed: "Some of these are display settings you can set yourself.",
  none: "You don't need to do anything.",
};

/** The line for each reason kind's group, over the contracts' kind tuple so a new kind fails `tsc` until it has one. The display
 *  settings group names the Appearance settings the file's keys stand for, by those settings' own labels; the others need nothing
 *  from the person. */
const GROUP_LINE: Record<ThemeLeftoverReasonKind, (appearanceLabels: readonly string[]) => string> = {
  appearance: (labels) => `Set these yourself under Settings, Appearance: ${labels.join(", ")}.`,
  "no-equivalent": () => "These have no equivalent in Orbweaver, so there is nothing to set.",
  "faint-colour": () => "These text colours were too faint to read on the theme's background, so Orbweaver keeps its own readable colour.",
};

/** The line the note shows for the group of leftovers that share `kind`. */
export function themeImportGroupLine(kind: ThemeLeftoverReasonKind, appearanceLabels: readonly string[]): string {
  return GROUP_LINE[kind](appearanceLabels);
}

/** The disclosure trigger's name in each state: the raw SillyTavern names are the secondary detail behind it. */
export function themeImportLeftoverToggleName(open: boolean): string {
  return open ? "Hide the SillyTavern names" : "Show the SillyTavern names";
}
