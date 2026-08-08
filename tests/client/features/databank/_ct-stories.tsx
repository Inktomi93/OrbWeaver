// Databank feature CT stories (core/Spine-Testing.md §7 — a CT mounts ONLY from a non-test module). The
// front door exports the SECTION DEFINITION (the shell mounts its surfaces in production), so the surfaces
// are deep-imported the way the world-info / regex / tag stories deep-import theirs. Every story wraps the
// real client data layer (<CtDataProviders> — Query + the real tRPC client over the routeTrpc-stubbed
// network), so what these CTs drive is the production read path, not a stand-in.
//
// This module exports COMPONENTS ONLY — playwright-ct rewrites named imports of a story module into
// generated component consts, so a mixed export (component + constant) fails to parse.

import type { ReactElement } from "react";
import { DatabankContextBody } from "../../../../packages/client/src/features/databank/components/databank-context-body.tsx";
import { DatabankListHeader } from "../../../../packages/client/src/features/databank/components/databank-list-header.tsx";
import { databankDocumentsTile } from "../../../../packages/client/src/features/databank/lib/home-documents-tile.tsx";
import { DatabankDetailSurface } from "../../../../packages/client/src/features/databank/surfaces/databank-detail-surface.tsx";
import { DatabankLibrarySurface } from "../../../../packages/client/src/features/databank/surfaces/databank-library-surface.tsx";
import { HomeSurface } from "../../../../packages/client/src/features/home/index.ts";
import type { HomeTileContribution } from "../../../../packages/client/src/lib/index.ts";
import { createContributorRegistry } from "../../../../packages/client/src/lib/index.ts";
import { useActiveSection, useSelectedDocumentId } from "../../../../packages/client/src/state/index.ts";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

/** The LIST pane at its REAL production width — the 320px panel floor the §6.1 width math is stated at, so
 *  a clipped title or a cluster that does not fit is visible here rather than hidden by a roomy story box. */
export function DatabankLibraryStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 700, overflow: "hidden", width: 320 }}>
        <DatabankLibrarySurface />
      </div>
    </CtDataProviders>
  );
}

/** The LIST chrome band (title · count · Add · the D-6 maintenance kebab). */
export function DatabankListHeaderStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ display: "flex", justifyContent: "space-between", width: 320 }}>
        <DatabankListHeader />
      </div>
    </CtDataProviders>
  );
}

/** CONTENT — the welcome arm with nothing selected, and the document detail once a row is opened (the
 *  selection store is module state, so the LIST story's click drives this one in the same page). */
export function DatabankDetailStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 700, width: 720 }}>
        <DatabankDetailSurface />
      </div>
    </CtDataProviders>
  );
}

/** The same two panes at the WIDEST real host — the ~1450px CONTENT the shell gives this section on a
 *  1920px desktop with the context panel collapsed. The 720px story cannot see a MEASURE defect: a
 *  `justify="between"` readout only reads as broken once the pane is wider than anyone reads across, and
 *  the LIST rides along because a CONTENT pane needs a selection to have anything to measure. */
export function DatabankDetailWideStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ display: "flex", height: 700, width: 1760 }}>
        <div style={{ flex: "none", overflow: "hidden", width: 320 }}>
          <DatabankLibrarySurface />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DatabankDetailSurface />
        </div>
      </div>
    </CtDataProviders>
  );
}

/** The CONTEXT activation body (Everywhere · Active in · the retrieval pointer). */
export function DatabankContextStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 700, width: 320 }}>
        <DatabankContextBody />
      </div>
    </CtDataProviders>
  );
}

// ── The HOME tile (D-7) ────────────────────────────────────────────────────────────────────────────
// The tile is mounted through the REAL `HomeSurface`, so the kicker frame, the per-tile QueryBoundary and
// the trailing action are the SHIPPED ones and not a story's own scaffold. The `<output>` publishes the two
// stores a row click writes (databank's selection + the shell's active section), so the navigation
// assertion reads the STORE ACTION, never a rendered echo.

function DatabankHomeProbe(): ReactElement {
  return (
    <output>
      section={useActiveSection()} document={useSelectedDocumentId() ?? "none"}
    </output>
  );
}

function DatabankHomeTile({ width }: { readonly width: number }): ReactElement {
  return (
    <CtDataProviders>
      <DatabankHomeProbe />
      <div style={{ width }}>
        <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [databankDocumentsTile])} />
      </div>
    </CtDataProviders>
  );
}

/** The tile at a DESKTOP home host (the content region a two-column grid is drawn at). */
export function DatabankHomeTileStory(): ReactElement {
  return <DatabankHomeTile width={720} />;
}

/** The tile at the NARROWEST real host — a phone's content region, where the grid is one column and the
 *  health line's chips have no slack. A chip pushed out of the card is exactly what this tile exists to
 *  say, so the geometry is asserted here, not at the roomy width. */
export function DatabankHomeTileNarrowStory(): ReactElement {
  return <DatabankHomeTile width={390} />;
}

/** The whole tri-pane — LIST + CONTENT + CONTEXT at their production widths. The selection handoff (a row
 *  click opens THAT document in both other panes) is a property of the three TOGETHER, and a CT mounts once
 *  per test (`ct-mount-is-once-per-test`), so the pair cannot be assembled out of two mounts. */
export function DatabankWorkspaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ display: "flex", height: 700 }}>
        <div style={{ flex: "none", overflow: "hidden", width: 320 }}>
          <DatabankLibrarySurface />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DatabankDetailSurface />
        </div>
        <div style={{ flex: "none", width: 320 }}>
          <DatabankContextBody />
        </div>
      </div>
    </CtDataProviders>
  );
}
