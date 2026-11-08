// characterCreateChrome and characterImportChrome — the Characters pane's PRIMARY and its secondary, as registered
// `topbar.trail` widgets on a phone (owner ruling 2026-09-05, #1669 arm A).
//
// WHY A SECTION'S ACTION IS SHELL CHROME AT ALL. Measured on an isolated stage at 430×740 DPR3 coarse: the
// first character row started at y=280 of a 740px phone — 37.8% of the screen spent before the thing the
// reader came for. Every band above it is owner-ruled and none of them compresses (program #102 variant B's
// two named groups · #491's never-collapsing FILTERS · the ONE-NAME-PER-SCREEN title shed), so the height
// has to be bought by REMOVING a band. The LIST chrome band was the one that could go: on a phone its title
// is already shed, and what kept the 48px row alive was its `action` slot — the `:has()` rule in shell.css
// ("…AND THE BAND GOES WITH IT WHEN NOTHING IS LEFT") sheds the whole band the moment nothing but the
// identity cluster is in it. So the actions MOVE, to the one row a phone always paints, and the band goes.
//
// THE GATE IS THE BAND'S OWN CONDITION, spelled three ways because all three have to hold:
//   · `mobileViewport` — the desktop band is untouched and still carries these exact doors (#1669 rules
//     only the phone; `characters-list-header.tsx` renders `CharacterImportDoor` and `CharacterNewDoor` there).
//     NOT a mobile MODE: it is the same affordances, in the one place a phone has room for them.
//   · the active section IS Characters — these are SECTION-scoped entries in a shell-global zone, and the
//     registry's scoping vocabulary is `useVisible` (the `pluginTopbarChrome` / `contextToggleChrome`
//     precedent: a capability gate called unconditionally over the door-frozen list). `false` renders
//     NOTHING, no gap.
//   · the LIST is the SCREEN (`listMode === "docked"` — the ONE-SHELL arm). This is what keeps #520's "one
//     `New` door on the plane" intact: with a character open, the phone's screen is CONTENT, the list mode
//     resolves `collapsed`, and `CharacterLibraryWelcome` mints `CharacterLandingDoors` itself. Two doors
//     at once is exactly what that ruling forbids, so these stand down where the landing stands up.
//
// TWO ENTRIES, NEW FIRST. The trail keeps its leading entries when room runs out, so New (order 10) is the one that
// stays and Import (order 11) is the one that folds into the trail's menu: the name keeps the room, as the list
// band's title does (the ruling that keeps a section's name whole and folds actions first). New is the icon alone
// here; the phone's trail has no room for the word. This is not the split menu `character-create-actions.tsx`
// retired: each door is its own button, and Import's menu command is a single tap in the trail's menu, never a
// second click inside New.

import type { ReactElement } from "react";
import type { OverflowMenuForm } from "#lib";
import type { ChromeEntry } from "#state";
import { useActiveSection, useMobileViewport, useSectionListMode } from "#state";
import { CharacterImportDoor, CharacterNewDoor } from "../components/character-create-actions.tsx";
import { CHARACTER_IMPORT_FORM, CHARACTER_NEW_FORM } from "./character-door-forms.ts";

function useOnCharactersScreen(): boolean {
  // Three unconditional hook calls, never a short-circuit: `useVisible` is called once per entry over a
  // list frozen at the door, which is what makes hooks legal here at all — `&&` between two of them would
  // make the second conditional and break the rule this contract depends on.
  const mobile = useMobileViewport();
  const section = useActiveSection();
  const listMode = useSectionListMode("characters");
  return mobile && section === "characters" && listMode === "docked";
}

const newMenuForms = (): readonly OverflowMenuForm[] => [CHARACTER_NEW_FORM];
const importMenuForms = (): readonly OverflowMenuForm[] => [CHARACTER_IMPORT_FORM];

export const characterCreateChrome: ChromeEntry = {
  id: "character-create",
  label: CHARACTER_NEW_FORM.label,
  zone: "topbar.trail",
  // Ahead of the shell's own toggles (focus 20 / detail panel 30): the section's primary is what a reader
  // reaches for on this screen, and the trail reads outward from the title.
  order: 10,
  primary: true,
  useVisible: useOnCharactersScreen,
  // The same body in both lenses — this entry is never curated `mobile: "sheet"`, so `body("sheet")` is
  // unreachable and `presentation` has nothing to branch on.
  behavior: { kind: "widget", body: (): ReactElement => <CharacterNewDoor iconOnly={true} />, useMenuForms: newMenuForms },
};

export const characterImportChrome: ChromeEntry = {
  id: "character-import",
  label: CHARACTER_IMPORT_FORM.label,
  zone: "topbar.trail",
  // Right behind New, ahead of the shell's toggles, so the section's pair stays together and Import folds before New.
  order: 11,
  useVisible: useOnCharactersScreen,
  behavior: { kind: "widget", body: (): ReactElement => <CharacterImportDoor />, useMenuForms: importMenuForms },
};
