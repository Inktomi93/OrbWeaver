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
// `panels = { list, context }: "unavailable"` (owner decision H3 / arm L-b): home has NEITHER pane, and
// the shell must not ship a toggle that reveals "Home list — this surface isn't wired yet" on the app's
// front door, nor a detail-panel toggle onto `context: { kind: "none" }`, nor a focus-mode toggle whose
// whole job is hiding panes home does not have (it cold-booted labelled "Exit focus mode" back when focus
// was DERIVED from "both collapsed", which zero panels trivially satisfied — focus is one flag now, item
// 20, but the toggle still has nothing to act on here).

import { Compass } from "@orb/ui/icons";
import type { ContributorRegistry, HomeTileContribution } from "#lib";
import type { SectionDefinition } from "#state";
import { NO_SELECTION_TITLE, openModal } from "#state";
import { HomeSurface } from "../surfaces/home-surface.tsx";

export function makeHomeSection(tiles: ContributorRegistry<HomeTileContribution>): SectionDefinition {
  return {
    id: "home",
    rail: { label: "Home", icon: Compass, group: "primary", mobile: "tab", zone: "rail.brand" },
    panels: { list: "unavailable", context: "unavailable" },
    // No member to name — the mobile topbar prints the section label (NO_SELECTION_TITLE).
    useSelectionTitle: NO_SELECTION_TITLE,
    panelDefaults: { list: "collapsed", context: "collapsed" },
    placeholder: {
      title: "Home",
      description: "Your landing — recent threads, quick jumps, and whatever you keep here.",
    },
    content: () => <HomeSurface onNewChat={(): void => openModal("newChat")} tiles={tiles} />,
    context: { kind: "none" },
  };
}
