// characterCreateChrome — the Characters pane's PRIMARY, as a registered `topbar.trail` widget on a phone
// (owner ruling 2026-09-05, #1669 arm A).
//
// WHY A SECTION'S ACTION IS SHELL CHROME AT ALL. Measured on an isolated stage at 430×740 DPR3 coarse: the
// first character row started at y=280 of a 740px phone — 37.8% of the screen spent before the thing the
// reader came for. Every band above it is owner-ruled and none of them compresses (program #102 variant B's
// two named groups · #491's never-collapsing FILTERS · the ONE-NAME-PER-SCREEN title shed), so the height
// has to be bought by REMOVING a band. The LIST chrome band was the one that could go: on a phone its title
// is already shed, and what kept the 48px row alive was its `action` slot — the `:has()` rule in shell.css
// ("…AND THE BAND GOES WITH IT WHEN NOTHING IS LEFT") sheds the whole band the moment nothing but the
// identity cluster is in it. So the action MOVES, to the one row a phone always paints, and the band goes.
//
// THE GATE IS THE BAND'S OWN CONDITION, spelled three ways because all three have to hold:
//   · `mobileViewport` — the desktop band is untouched and still carries this exact cluster (#1669 rules
//     only the phone; `characters-list-header.tsx` renders `CharacterCreateActions` there). NOT a mobile
//     MODE: it is the same affordance, in the one place a phone has room for it.
//   · the active section IS Characters — this is a SECTION-scoped entry in a shell-global zone, and the
//     registry's scoping vocabulary is `useVisible` (the `pluginCommandsChrome` / `fullscreenChrome`
//     precedent: a capability gate called unconditionally over the door-frozen list). `false` renders
//     NOTHING, no gap.
//   · the LIST is the SCREEN (`listMode === "docked"` — the ONE-SHELL arm). This is what keeps #520's "one
//     `New` door on the plane" intact: with a character open, the phone's screen is CONTENT, the list mode
//     resolves `collapsed`, and `CharacterLibraryWelcome` mints `CharacterLandingDoors` itself. Two doors
//     at once is exactly what that ruling forbids, so this one stands down where the landing stands up.
//
// ONE ENTRY, TWO BUTTONS — deliberately, and it is not the split menu `character-create-actions.tsx`
// retired. The registry entry is a WIDGET whose body is the BAND'S OWN cluster, so the phone's topbar and
// the desktop's band are the same two affordances rendered from one component: Import as an `icon-sm` ghost,
// New as the `sm` primary. Burying Import inside New would resurrect the "+ split menu" that file's header
// records as killed for hiding both verbs one click deep.

import type { ReactElement } from "react";
import type { ChromeEntry } from "#state";
import { useActiveSection, useMobileViewport, useSectionListMode } from "#state";
import { CharacterCreateActions } from "../components/character-create-actions.tsx";

export const characterCreateChrome: ChromeEntry = {
  id: "character-create",
  label: "New character",
  zone: "topbar.trail",
  // Ahead of the shell's own toggles (focus 20 / detail panel 30): the section's primary is what a reader
  // reaches for on this screen, and the trail reads outward from the title.
  order: 10,
  useVisible: (): boolean => {
    // Three unconditional hook calls, never a short-circuit: `useVisible` is called once per entry over a
    // list frozen at the door, which is what makes hooks legal here at all — `&&` between two of them would
    // make the second conditional and break the rule this contract depends on.
    const mobile = useMobileViewport();
    const section = useActiveSection();
    const listMode = useSectionListMode("characters");
    return mobile && section === "characters" && listMode === "docked";
  },
  // The same cluster in both lenses — this entry is never curated `mobile: "sheet"`, so `body("sheet")` is
  // unreachable and `presentation` has nothing to branch on.
  behavior: { kind: "widget", body: (): ReactElement => <CharacterCreateActions /> },
};
