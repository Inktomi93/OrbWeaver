// The Home rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the landing
// section the Weave glyph navigates to (home-section-spec §1.1). This does NOT re-open lockdown §7's
// "there is no home page" ruling: that killed a ROUTE named home-page that hand-assembled a 63-symbol
// god-map. Home is a SECTION — no route body, no `sections={{…}}` map, no router entry.
//
// `makeHomeSection(tiles)` is the FACTORY posture `makeChatsSection`/`makeCharactersSection` established:
// the door builds the `home-tiles` contributor registry and hands it in, so home consumes its tiles BLIND
// and imports zero features.
//
// The rail entry targets the `rail.brand` zone (home-section-spec §4.1): app-shell never spells "home" —
// it renders the chrome entry the registry derived from THIS declaration, exactly as it renders every
// other rail button. `icon: Compass` is the mobile/⌘K face; the desktop face is the glyph itself.
//
// `panels.list = "unavailable"` (owner decision H3 / arm L-b): home has no LIST pane, and the shell must
// not ship a toggle that reveals "Home list — this surface isn't wired yet" on the app's front door.

import { Compass } from "@orb/ui/icons";
import type { ContributorRegistry, HomeTileContribution } from "#lib";
import type { SectionDefinition } from "#state";
import { openModal } from "#state";
import { HomeSurface } from "../surfaces/home-surface";

export function makeHomeSection(tiles: ContributorRegistry<HomeTileContribution>): SectionDefinition {
  return {
    id: "home",
    rail: { label: "Home", icon: Compass, group: "primary", mobile: "tab" },
    panelDefaults: { list: "collapsed", context: "collapsed" },
    placeholder: {
      title: "Home",
      description: "Your landing — recent threads, quick jumps, and whatever you keep here.",
    },
    content: () => <HomeSurface onNewChat={(): void => openModal("newChat")} tiles={tiles} />,
    context: { kind: "none" },
  };
}
