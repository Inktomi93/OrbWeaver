// Databank feature CT stories (docs/law/Spine-Testing.md §7 — a CT mounts ONLY from a non-test module). The
// front door exports the SECTION DEFINITION (the shell mounts its surfaces in production), so the surfaces
// are deep-imported the way the world-info / regex / tag stories deep-import theirs. Every story wraps the
// real client data layer (<CtDataProviders> — Query + the real tRPC client over the routeTrpc-stubbed
// network), so what these CTs drive is the production read path, not a stand-in.
//
// This module exports COMPONENTS ONLY — playwright-ct rewrites named imports of a story module into
// generated component consts, so a mixed export (component + constant) fails to parse.

import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { ModalHost } from "../../../../packages/client/src/features/app-shell/components/modal-host.tsx";
import { DatabankContextBody } from "../../../../packages/client/src/features/databank/components/databank-context-body.tsx";
import { DatabankListHeader } from "../../../../packages/client/src/features/databank/components/databank-list-header.tsx";
import { databankDocumentsTile } from "../../../../packages/client/src/features/databank/lib/home-documents-tile.tsx";
import { DatabankDetailSurface } from "../../../../packages/client/src/features/databank/surfaces/databank-detail-surface.tsx";
import { DatabankLibrarySurface } from "../../../../packages/client/src/features/databank/surfaces/databank-library-surface.tsx";
import { HomeSurface, makeSectionJumpTile } from "../../../../packages/client/src/features/home/index.ts";
import { createContributorRegistry } from "../../../../packages/client/src/lib/index.ts";
import type { HomeTileContribution } from "../../../../packages/client/src/state/index.ts";
import {
  closeModal,
  setFocusMode,
  useActiveChatId,
  useActiveSection,
  useConfigTarget,
  useDatabankPhaseFilter,
  useOpenModal,
  useSelectedCharacterId,
  useSelectedDocumentId,
} from "../../../../packages/client/src/state/index.ts";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/browser/ct-data-providers.tsx";
import { CONTENT_COLUMN_NARROW_PANE, CONTENT_COLUMN_WIDE_PANE } from "../../../support/browser/measure-content-column.ts";

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

// THE TALL (4000px) PAGINATION STORY IS GONE (2026-08-14). It existed so a test could reach a "Load more"
// button below the fold of a non-virtualized 700px pane. The pane virtualizes now, and `<VirtualList>`'s own
// tripwire THROWS on a scroll container more than a few viewports tall — correctly: at 4000px every row is
// "visible" and virtualization is a no-op, so the story was measuring a list the product never renders. The
// deep-bank pins run at the REAL 320×700 mount and walk it by scrolling, which is also the honest rendered
// proof (a lens/paging bug that only appears at the production height is exactly what this pane has shipped
// before).

/** The LIST chrome band (title · count · Add · the D-6 maintenance kebab) PLUS the shell's real ModalHost:
 *  the band's Add opens a MODAL SLOT now (P1-2), so the dialog it opens is the shell's, not the band's, and
 *  a story without the host would assert on a dialog that production renders one level up. */
export function DatabankListHeaderStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ display: "flex", justifyContent: "space-between", width: 320 }}>
          <DatabankListHeader />
        </div>
        <CtModalSlotHost />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** Renders whichever modal slot the shell store has open — the AppShell's own `ModalHost` wiring, reduced
 *  to the two lines a story needs. */
function CtModalSlotHost(): ReactElement {
  const open = useOpenModal();
  return <ModalHost onClose={closeModal} openModal={open ?? null} />;
}

/** CONTENT — the welcome arm with nothing selected, and the document detail once a row is opened (the
 *  selection store is module state, so the LIST story's click drives this one in the same page).
 *
 *  UNDER THE REAL SECTION REGISTRY since #434: the pane's no-selection arm reads the shell's LIST MODE for
 *  this section (`useSectionListMode`), which resolves the section DEFINITION's `panelDefaults` — nothing is
 *  collapsed here, so it renders the section's boot layout (LIST docked, i.e. on screen). */
export function DatabankDetailStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: 700, width: 720 }}>
          <DatabankDetailSurface />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** CONTENT alone, with a live driver for the shell's LIST MODE (#434) — the LIST pane is deliberately NOT
 *  mounted, because the arm under test is "the list is off screen, so this pane cannot defer to it". Both
 *  arms in ONE mount (a CT mounts once per test).
 *
 *  THE DRIVER IS FOCUS MODE: the shell's ONE flag for "no side panel is showing" (item 20) — regime-free,
 *  section-independent and synchronous, where `setPanelMode` writes the ACTIVE section's override and
 *  `setActiveSection` defers its write through `withViewTransition` (a story doing both in one handler lands
 *  the override on the previous section — measured). The pane reads the RESOLVED mode, so any regime that
 *  resolves `collapsed` exercises it; the override path's own resolution is pinned in `shell-store.ct`. */
export function DatabankDetailListModeStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <button type="button" onClick={(): void => setFocusMode(true)}>
          take the list off screen
        </button>
        <button type="button" onClick={(): void => setFocusMode(false)}>
          put the list back
        </button>
        <div style={{ height: 700, width: 720 }}>
          <DatabankDetailSurface />
        </div>
      </CtRealSectionRegistry>
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
      <CtRealSectionRegistry>
        <div style={{ display: "flex", height: 700, width: 1760 }}>
          <div style={{ flex: "none", overflow: "hidden", width: 320 }}>
            <DatabankLibrarySurface />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DatabankDetailSurface />
          </div>
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The document detail at the two pane widths its CONTENT COLUMN behaves differently at (#1664): below the
 *  `@5xl` container step, where it takes `--width-content-col` and centers, and above it, where it breathes
 *  to `--width-content-col-wide`. ONE mount, both arms — the widen button is the crossover a CT cannot
 *  otherwise reach on a fixed host.
 *
 *  THE `<Container>` IS PRODUCTION, NOT SCAFFOLDING. This surface's `<Surface tier="form">` is
 *  `display: contents`, so it declares no query container of its own: in the shell the `@5xl` resolves
 *  against the CONTENT REGION, which `RegionAnchor` wraps in exactly this named `@orb/ui` container. A
 *  story without it has no `container-type` ancestor at all, the breathe arm can never match, and the pin
 *  would certify a production it does not have (the oracle refuses loudly rather than reading that as a
 *  pass). Measured on the real shell: 968px both-docked, 1864px in focus mode at 1920. */
export function DatabankDetailContentColumnStory(): ReactElement {
  const [width, setWidth] = useState(CONTENT_COLUMN_NARROW_PANE);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <button onClick={(): void => setWidth(CONTENT_COLUMN_WIDE_PANE)} type="button">
          widen the pane
        </button>
        {/* The WIDTH rides the row, not the region: `.shell-region-fill` is `flex: 1 1 auto`, so a width on
            the region itself is grown away — it fills its cell in the shell too, which is the point. */}
        <div style={{ display: "flex", height: 700, width: width + 320 }}>
          <div style={{ flex: "none", overflow: "hidden", width: 320 }}>
            <DatabankLibrarySurface />
          </div>
          <Container className="shell-region-fill" name="content">
            <DatabankDetailSurface />
          </Container>
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The CONTEXT activation body (Everywhere · Active in · the retrieval door). */
export function DatabankContextStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 700, width: 320 }}>
        <DatabankContextBody />
      </div>
    </CtDataProviders>
  );
}

/** The nav-store probe every CONTEXT-pane DOOR is asserted through: `openConfigTo`, `openChat` and
 *  `openCharacter` all write the shell/selection stores, so a deep link is proven at the STORE ACTION (the
 *  config target's group + sub, or the section + the id it selected), never at a rendered echo —
 *  these stories mount neither a settings shell nor a chats section to echo one. */
function DatabankSettingsProbe(): ReactElement {
  return (
    <output>
      modal={useOpenModal() ?? "none"} category={useConfigTarget()?.group ?? "none"} sub={useConfigTarget()?.sub ?? "none"} section={useActiveSection()} chat=
      {useActiveChatId() ?? "none"} character={useSelectedCharacterId() ?? "none"}
    </output>
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
      section={useActiveSection()} document={useSelectedDocumentId() ?? "none"} modal={useOpenModal() ?? "none"} phase={useDatabankPhaseFilter() ?? "none"}
    </output>
  );
}

function DatabankHomeTile({ width, withJumpGrid = false }: { readonly width: number; readonly withJumpGrid?: boolean }): ReactElement {
  // The door's own assembly shape: the jump tile is built FROM its siblings, so the claim the databank tile
  // makes (`sectionId`) is resolved exactly as production resolves it.
  const siblings = [databankDocumentsTile];
  const tiles = withJumpGrid ? [...siblings, makeSectionJumpTile(siblings)] : siblings;
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <DatabankHomeProbe />
        <div style={{ width }}>
          <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", tiles)} />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The tile at a DESKTOP home host (the content region a two-column grid is drawn at). */
export function DatabankHomeTileStory(): ReactElement {
  return <DatabankHomeTile width={720} />;
}

/** The tile BESIDE home's jump grid, assembled the way the door assembles them — so the Databank jump row's
 *  absence is a property of the real derivation, not of a story that left the grid out. */
export function DatabankHomeTileWithJumpGridStory(): ReactElement {
  return <DatabankHomeTile width={720} withJumpGrid={true} />;
}

/** The tile ABOVE the library pane, in ONE mount — the deep link the health chips write is a property of
 *  the two together (a CT mounts once per test, so the chip and the list it scopes cannot be two mounts). */
export function DatabankHomeTileAndLibraryStory(): ReactElement {
  return (
    <CtDataProviders>
      <DatabankHomeProbe />
      <div style={{ width: 720 }}>
        <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [databankDocumentsTile])} />
      </div>
      {/* NAMED so a test can tell the pane's rows from the tile's — both render the same documents, which
          is the whole point of the seam under test. */}
      <section aria-label="Library pane" style={{ height: 700, overflow: "hidden", width: 320 }}>
        <DatabankLibrarySurface />
      </section>
    </CtDataProviders>
  );
}

/** The tile at the NARROWEST real host — a phone's content region, where the grid is one column and the
 *  health line's chips have no slack. A chip pushed out of the card is exactly what this tile exists to
 *  say, so the geometry is asserted here, not at the roomy width. */
export function DatabankHomeTileNarrowStory(): ReactElement {
  return <DatabankHomeTile width={390} />;
}

/** The tile at a 360px phone's content region, where the empty bank's two doors cannot share one line. */
export function DatabankHomeTilePhoneStory(): ReactElement {
  return <DatabankHomeTile width={360} />;
}

/** The whole tri-pane — LIST + CONTENT + CONTEXT at their production widths. The selection handoff (a row
 *  click opens THAT document in both other panes) is a property of the three TOGETHER, and a CT mounts once
 *  per test (`ct-mount-is-once-per-test`), so the pair cannot be assembled out of two mounts. */
export function DatabankWorkspaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <DatabankSettingsProbe />
        <DatabankTriPane />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The same tri-pane PLUS the list-mode driver `DatabankDetailListModeStory` uses — for the pins that must
 *  count what the three panes render on an EMPTY bank.
 *
 *  WHY A DRIVER IS NEEDED TO COUNT A STAND-DOWN: since #434 the CONTENT pane renders NOTHING on an empty
 *  bank with the list on screen — and it also renders nothing while its `databank.bankHealth` census is in
 *  flight. Those two states are indistinguishable in the DOM, so a census taken at boot can pass while the
 *  pane is merely late, which is exactly the vacuous green the N-4 pin exists to prevent. Flipping the list
 *  OFF screen makes the pane print its welcome (a POSITIVE settle — the census has landed), and flipping it
 *  back returns the boot layout with that fact established. */
export function DatabankWorkspaceListModeStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <DatabankSettingsProbe />
        <button onClick={(): void => setFocusMode(true)} type="button">
          take the list off screen
        </button>
        <button onClick={(): void => setFocusMode(false)} type="button">
          put the list back
        </button>
        <DatabankTriPane />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

function DatabankTriPane(): ReactElement {
  return (
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
  );
}
