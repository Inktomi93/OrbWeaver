// Chat's MASTHEAD contribution — home's opening sentence (program #102, mockup variant C). One more
// co-located file plus one array member at the door, exactly like every other tile: home renders a
// `masthead`-region contribution and never learns that the count in it came from chat.
//
// WHY IT IS A TILE AND NOT SOMETHING HOME OWNS: the sentence is about YOUR ROOMS, and `client-features-
// no-cross` makes an `import … from "#features/chat"` in home RED. The only alternatives were a static
// "Home" (the chrome this pass deletes) or home reaching for `trpc.chat` itself, which would move chat's
// data AND intent into the host — the exact thing the tile ownership rule homes here instead.
//
// It carries NO `action` and NO `icon` in the frame: the masthead region is deliberately chrome-less (see
// `HomeTileRegion`), so `icon` here is only what the ⌘K/registry surfaces would show if they ever list a
// tile by glyph — it paints nothing on home.

import { Compass } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { HomeMastheadBody, HomeMastheadSkeleton } from "../components/home-masthead-body.tsx";

const MASTHEAD_TILE_ORDER = 0;

export const chatMastheadTile: HomeTileContribution = {
  id: "chat.masthead",
  title: "Home",
  icon: Compass,
  order: MASTHEAD_TILE_ORDER,
  region: "masthead",
  // The body is copy that wraps with the pane, so a row count or px constant fits one width only; a
  // skeleton set in the same copy and voices wraps the same way at every width.
  skeleton: () => <HomeMastheadSkeleton />,
  body: () => <HomeMastheadBody />,
};
