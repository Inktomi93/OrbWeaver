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
// only affordance besides the rows themselves.

import { Button } from "@orb/ui/button";
import { Database } from "@orb/ui/icons";
import type { HomeTileContribution } from "#lib";
import { setActiveSection } from "#state";
import { HomeDocumentsTileBody } from "../components/home-documents-tile-body.tsx";

const DOCUMENTS_TILE_ORDER = 50;

export const databankDocumentsTile: HomeTileContribution = {
  id: "databank.documents",
  // The section's own name, so the tile and the rail glyph you jump to read as one place.
  title: "Databank",
  icon: Database,
  order: DOCUMENTS_TILE_ORDER,
  action: (
    <Button intent="ghost" onClick={(): void => setActiveSection("databank")} size="sm">
      All documents →
    </Button>
  ),
  body: () => <HomeDocumentsTileBody />,
};
