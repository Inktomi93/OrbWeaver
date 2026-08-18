// Databank's HOME tile contribution (databank-surface-spec D-7 — "recent documents + an ingest-health
// line", the rider the spec attached to the D-0 library-home fork precisely because it holds either way:
// the bank is reachable from the front door whether the library is a rail section or a folded family).
//
// The whole cost of databank's presence on home is THIS FILE plus one array member at the main.tsx door
// (home-section-spec §3.1) — home imports nothing from here, and this feature imports nothing from home
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
// `sectionId` — RETRACTED 2026-08-17 (side-eye rail sweep, the IA finding), and the reasoning it replaces
// is kept here because it was a RECORDED ruling this file cited as its reason:
//
//   ~~WHY DATABANK DECLARES IT AND CHAT'S THREE TILES DO NOT (side-eye 2026-08-08 P2-c). The jump grid is a
//   NAV surface: a row per section, each teaching what lives there. This tile does that row's entire job
//   and more — the section's name, its glyph, its live contents, its health and a door into it — so the two
//   together are one destination twice, ten pixels apart.~~
//
// What that ruling did not survive is the SHAPE CHANGE under it. When it was written the jump grid was
// seven fat teaching ROWS, and a duplicate row really was a duplicate block; program #102 replaced it with
// a wrapping PILL RAIL under the band "Elsewhere in the house", whose whole promise is that every room in
// the house is one skim away. Databank became the ONE section missing from that rail — measured on the
// live surface: eight pills for nine sections — so the rail quietly stopped being an index, and the claim
// that this tile "is a door into the section" was itself only true while the bank had rows in it (the
// trailing action hides on an empty bank). The pill costs one line of a wrapping rail; the ruling was
// paying for it with the surface's only complete map.
//
// THE MECHANISM IS UNTOUCHED: `HomeTileContribution.sectionId` and the rail's derived drop both stay
// exactly as built. No tile claims a section today — this was the only claimer — and the field is what a
// future tile that genuinely REPLACES a nav destination (a full-section-surface tile) would still declare.

import { Database } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { HomeDocumentsTileAction, HomeDocumentsTileBody, RECENT_DOCUMENTS_LIMIT } from "../components/home-documents-tile-body.tsx";

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
  // NO `sectionId` (see the header): this tile no longer suppresses Databank's pill in "Elsewhere in the
  // house", because that rail is the surface's index of the house and databank was the one room missing.
  skeletonRows: DOCUMENTS_SKELETON_ROWS,
  // A COMPONENT, not a static node: it hides itself on an empty bank (P2-b).
  action: <HomeDocumentsTileAction />,
  body: () => <HomeDocumentsTileBody />,
};
