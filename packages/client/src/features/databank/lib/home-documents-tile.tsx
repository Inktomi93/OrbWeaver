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
// `action` is a GHOST (CD3 — the ONE accent primary on home belongs to temp chat), and it is the tile's
// only affordance besides the rows and the health chips.
//
// `sectionId` — WHY DATABANK DECLARES IT AND CHAT'S THREE TILES DO NOT (side-eye 2026-08-08 P2-c). The
// jump grid is a NAV surface: a row per section, each teaching what lives there. This tile does that row's
// entire job and more — the section's name, its glyph, its live contents, its health and a door into it —
// so the two together are one destination twice, ten pixels apart. Chat's tiles are DATA surfaces that do
// NOT substitute for a nav row: "Recent chats" launches a specific thread and "Temp chat" starts a new one;
// neither says "the Chats section is over here", so the Chats jump row keeps earning its pixels. The rule
// is therefore "a tile that SUBSUMES its section's nav row declares it", not "any tile hides its section" —
// stated here because the wider question (should home adopt this consistently?) is the owner's, not this
// file's.

import { Database } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { HomeDocumentsTileAction, HomeDocumentsTileBody } from "../components/home-documents-tile-body.tsx";

const DOCUMENTS_TILE_ORDER = 50;

export const databankDocumentsTile: HomeTileContribution = {
  id: "databank.documents",
  // The section's own name, so the tile and the rail glyph you jump to read as one place.
  title: "Databank",
  icon: Database,
  order: DOCUMENTS_TILE_ORDER,
  // The section this tile SUBSUMES on home — the jump grid drops its Databank row while this tile is
  // registered (side-eye 2026-08-08 P2-c: two doors to one place, ten pixels apart, one of them richer).
  sectionId: "databank",
  // A COMPONENT, not a static node: it hides itself on an empty bank (P2-b).
  action: <HomeDocumentsTileAction />,
  body: () => <HomeDocumentsTileBody />,
};
