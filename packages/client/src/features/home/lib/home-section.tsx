// The Home rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the landing
// section the Weave glyph navigates to. This does NOT re-open lockdown §7's
// "there is no home page" ruling: that killed a ROUTE named home-page that hand-assembled a 63-symbol
// god-map. Home is a SECTION — no route body, no `sections={{…}}` map, no router entry.
//
// `makeHomeSection(tiles)` is the FACTORY posture `makeChatsSection`/`makeCharactersSection` established:
// the door builds the `home-tiles` contributor registry and hands it in, so home consumes its tiles BLIND
// and imports zero features.
//
// The rail entry targets the `rail.brand` zone: app-shell never spells "home" —
// it renders the chrome entry the registry derived from THIS declaration, exactly as it renders every
// other rail button. `icon: Compass` is the mobile/⌘K face; the desktop face is the glyph itself.
//
// Home owns neither side pane; availability derives from its absent list and context body.

import { Compass } from "@orb/ui/icons";
import type { ContributorRegistry } from "#lib";
import type { HomeTileContribution, SectionDefinition } from "#state";
import { NO_SELECTION_TITLE, openNewChatPicker } from "#state";
import { HomeSurface } from "../surfaces/home-surface.tsx";

export function makeHomeSection(tiles: ContributorRegistry<HomeTileContribution>): SectionDefinition {
  return {
    id: "home",
    rail: { label: "Home", icon: Compass, group: "primary", mobile: "tab", zone: "rail.brand" },
    // No member to name — the mobile topbar prints the section label (NO_SELECTION_TITLE).
    useSelectionTitle: NO_SELECTION_TITLE,
    contentInset: { planned: "The full-width Home scroller contains touch shelves that extend through its section inset." },
    panelDefaults: { list: "collapsed", context: "collapsed" },
    placeholder: {
      title: "Home",
      description: "Your landing — recent threads, quick jumps, and whatever you keep here.",
    },
    content: () => <HomeSurface onNewChat={openNewChatPicker} tiles={tiles} />,
    context: { kind: "none" },
  };
}
