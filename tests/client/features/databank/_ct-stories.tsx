// Databank feature CT stories (core/Spine-Testing.md §7 — a CT mounts ONLY from a non-test module). The
// front door exports the SECTION DEFINITION (the shell mounts its surfaces in production), so the surfaces
// are deep-imported the way the world-info / regex / tag stories deep-import theirs. Every story wraps the
// real client data layer (<CtDataProviders> — Query + the real tRPC client over the routeTrpc-stubbed
// network), so what these CTs drive is the production read path, not a stand-in.
//
// This module exports COMPONENTS ONLY — playwright-ct rewrites named imports of a story module into
// generated component consts, so a mixed export (component + constant) fails to parse.

import type { ReactElement } from "react";
import { DatabankContextBody } from "../../../../packages/client/src/features/databank/components/databank-context-body";
import { DatabankListHeader } from "../../../../packages/client/src/features/databank/components/databank-list-header";
import { DatabankDetailSurface } from "../../../../packages/client/src/features/databank/surfaces/databank-detail-surface";
import { DatabankLibrarySurface } from "../../../../packages/client/src/features/databank/surfaces/databank-library-surface";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

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
