// Databank's HOME tile contribution (D-7 — "recent documents + an ingest-health
// line", the rider the spec attached to the D-0 library-home fork precisely because it holds either way:
// the bank is reachable from the front door whether the library is a rail section or a folded family).
//
// The whole cost of databank's presence on home is THIS FILE plus one array member at the main.tsx door
// — home imports nothing from here, and this feature imports nothing from home
// beyond the tier-4 contract.
//
// `order` 50 — after the shell-derived jump grid (40) and before the dormant doorways (80/90): a bank you
// actually own outranks a doorway to a domain that does not exist yet, and it never competes with the
// three chat tiles that carry the launcher.
//
// `action` is a GHOST, and it is the tile's only affordance besides the rows and the health chips.
//
// CD3 RE-RULED, 2026-08-16 (owner pick on program #102). The clause above used to read "(CD3 — the ONE
// accent primary on home belongs to temp chat)". Kept struck rather than deleted, because it was a
// recorded decision that this file cited as its reason. Home's one focal is now the RESUME-ROOM HERO in
// chat's recents body (a `--color-speaker` stripe plus the rationed `--shadow-glow` on a ::before, no
// accent fill); temp chat is a secondary button. The ghost here is unchanged and now for a stronger
// reason — nothing on the shelf may compete with the hearth.
//
// `sectionId` is declared: this tile carries the section's name, glyph, live contents, health and a door into it, so
// Elsewhere does not repeat Databank while the tile is on screen. The tile is unconditionally visible, which is what
// keeps the claim safe (see `HomeTileContribution.sectionId`).

import { Database } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { HomeDocumentsTileAction, HomeDocumentsTileBody, RECENT_DOCUMENTS_LIMIT } from "../components/home-documents-tile-body.tsx";

/** LAST on the shelf, which makes this tile the shelf's FOOT — the block `home-surface.tsx` pairs with the
 *  roadmap fold at a wide pane.
 *
 *  MOVING IT UP WAS MEASURED AND REFUSED (#499, 2026-08-22). Promoting it to 25 (above Temp chat) lifts the
 *  empty bank's calls to action 133px clear of the 1280×800 fold — but the foot is then Temp chat's, and the
 *  foot is where the SHELF hides a tall block's height behind the doorway group's own. Trading the tall tile
 *  into flow for the short one cost the #226 column-balance fence three wide-pane cells (1920/defaults
 *  11→22px, 1920/compact 3→36px, 2560/compact 3→20px of column void, measured on
 *  `home-column-balance.suite.ct.tsx`), i.e. it paid for a narrow pane with a worse wide one — the exact
 *  trade that fence's never-regress table exists to catch. The fold recovery that costs nothing lives in the
 *  BODY instead (see `home-documents-tile-body.tsx`: the empty arm leads with its doors). */
const DOCUMENTS_TILE_ORDER = 50;

/** The FIRST-BOOT skeleton box (#92): the health line, then `RECENT_DOCUMENTS_LIMIT` document rows —
 *  derived from the body's own read so the two cannot drift. From boot two on the MEASURED box wins. */
const DOCUMENTS_SKELETON_ROWS = RECENT_DOCUMENTS_LIMIT + 1;

export const databankDocumentsTile: HomeTileContribution = {
  id: "databank.documents",
  // The section's own name, so the tile and the rail glyph you jump to read as one place.
  title: "Databank",
  icon: Database,
  order: DOCUMENTS_TILE_ORDER,
  region: "shelf",
  sectionId: "databank",
  skeletonRows: DOCUMENTS_SKELETON_ROWS,
  // A COMPONENT, not a static node: it hides itself on an empty bank (P2-b).
  action: <HomeDocumentsTileAction />,
  body: () => <HomeDocumentsTileBody />,
};
