// Discovery (Corpus section) CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test
// module). Surfaces come through the feature front door, wrapped in the real client data layer
// (CtDataProviders — Query + real tRPC over the routeTrpc-stubbed network).

import {
  CorpusArchetypesTab,
  CorpusCompareTab,
  CorpusContent,
  CorpusContextHeader,
  CorpusDossierSurface,
  CorpusHomeSurface,
  CorpusListHeader,
  CorpusListSurface,
  CorpusMapTab,
  CorpusUnderstandingInvitation,
} from "@orb/client/features/discovery";
import { useActiveChatId, useActiveSection } from "@orb/client/state";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

/** The Corpus LIST navigator (omnibox + browse) over the real data layer. */
export function CorpusListSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 360 }}>
        <CorpusListSurface />
      </div>
    </CtDataProviders>
  );
}

/** A rendered reader of the two nav facts a corpus drill-through writes. A store write is only provable
 *  from a render (the stores are module-private and CT runs the component in the browser), so the memory
 *  hit's `selectChat` + `setActiveSection` land here as text a CT can assert. Non-exported: the stories
 *  module publishes components to the CT loader, and this one rides inside {@link CorpusListSurfaceNavStory}. */
function NavReadout(): ReactElement {
  return (
    <div data-testid="ct-nav-readout">
      section:{useActiveSection()} chat:{useActiveChatId() ?? "none"}
    </div>
  );
}

/** The Corpus LIST navigator BESIDE the nav readout — the mount that proves a memory hit is a door
 *  (R1a drill-through), not just a rendered row. */
export function CorpusListSurfaceNavStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 360 }}>
        <CorpusListSurface />
        <NavReadout />
      </div>
    </CtDataProviders>
  );
}

/** The Corpus LIST navigator at an EXPLICIT pane width. The target picker is a FIT question — five cells
 *  over a pane that is 320-360px in production — so its proof needs both ends of that range, not one width.
 *  Fixed-width host (`overflow: visible`) so a content-sized root cannot agree with a wrapping bug. */
export function CorpusListSurfaceWidthStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, overflow: "visible", width }}>
        <CorpusListSurface />
      </div>
    </CtDataProviders>
  );
}

/** THE LIST NAVIGATOR BESIDE THE CONTENT REGION — the mount that can prove a search hit is a door that
 *  LANDS, not merely one that fires: the corpus selection store is module-private, so the only honest
 *  receipt for "this row opens that dossier" is the dossier rendering in the region that hosts it (U4). */
export function CorpusSearchToDossierStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ display: "flex", height: 640, width: 900 }}>
        <div style={{ width: 360 }}>
          <CorpusListSurface />
        </div>
        <div style={{ flex: 1 }}>
          <CorpusContent />
        </div>
      </div>
    </CtDataProviders>
  );
}

/** THE RAIL BOUNCE (U1): the shell UNMOUNTS a section's LIST surface when you switch rails and mounts a
 *  fresh one when you come back, which is why the omnibox's query and target have to live somewhere that
 *  outlives the component. The switch here is that unmount/remount — the smallest honest stand-in for a rail
 *  switch, and the exact thing that used to empty the box. */
export function CorpusListSurfaceRailBounceStory(): ReactElement {
  const [inCorpus, setInCorpus] = useState(true);
  return (
    <CtDataProviders>
      <button type="button" onClick={(): void => setInCorpus((here) => !here)}>
        {inCorpus ? "Leave Corpus" : "Back to Corpus"}
      </button>
      <div style={{ height: 640, width: 360 }}>{inCorpus ? <CorpusListSurface /> : <p>Another section</p>}</div>
    </CtDataProviders>
  );
}

/** The Corpus LIST chrome-band header (title + distilled count) over the real data layer. */
export function CorpusListHeaderStory(): ReactElement {
  return (
    <CtDataProviders>
      <CorpusListHeader />
    </CtDataProviders>
  );
}

/** The Corpus CONTEXT-panel band identity (title + distilled count) over the real data layer. */
export function CorpusContextHeaderStory(): ReactElement {
  return (
    <CtDataProviders>
      <CorpusContextHeader />
    </CtDataProviders>
  );
}

/** The Corpus CONTEXT "Archetypes" tab over the real data layer, at the CONTEXT pane's real width — the
 *  cluster rows carry a face strip, so the mount has to be the width that decides how many seats fit. */
export function CorpusArchetypesTabStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 420 }}>
        <CorpusArchetypesTab />
      </div>
    </CtDataProviders>
  );
}

/** The understanding-pass INVITATION on its own, at the CONTENT island's real width — the card is the door
 *  that RUNS the pass (issue #155), so this is the mount that proves the enqueue, the dedupe and the failure
 *  arm without a whole surface's reads standing between the click and the wire. */
export function CorpusUnderstandingInvitationStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 640 }}>
        <CorpusUnderstandingInvitation />
      </div>
    </CtDataProviders>
  );
}

/** The Corpus CONTEXT "Map" tab at the CONTEXT pane's real width — the semantic scatter plus the genre key
 *  that decodes it (the plot is a sealed canvas, so the key is the only part a test or a reader can read). */
export function CorpusMapTabStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 420 }}>
        <CorpusMapTab />
      </div>
    </CtDataProviders>
  );
}

/** The Corpus CONTEXT "Compare" tab over the real data layer. */
export function CorpusCompareTabStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 420 }}>
        <CorpusCompareTab />
      </div>
    </CtDataProviders>
  );
}

/** The Corpus CONTENT REGION — the host that owns the pane's scroll and its inset for both surfaces, and
 *  therefore the only honest mount for either a padding or a first-run assertion. Fixed size: the region
 *  fills its host in production, and a content-sized mount root agrees with any inset bug. */
export function CorpusContentStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 720 }}>
        <CorpusContent />
      </div>
    </CtDataProviders>
  );
}

/** THE CORPUS OVERVIEW AT THE OWNER'S DEFAULT PANE WIDTH — the mount that decides whether the designed
 *  two-column focal composition renders in the view he actually looks at.
 *
 *  868.8125px is MEASURED, not chosen: `snap / --goto corpus` at a 1280 viewport with the LIST pane docked
 *  and the CONTEXT pane collapsed (the shipped default) resolves the surface's own `@container` to exactly
 *  that, re-measured 2026-08-18 AFTER the #242 both-docked pane squeeze landed. The surface is mounted bare
 *  rather than through `CorpusContent` on purpose: the region's `padding="section"` plus a scroller's
 *  scrollbar would make the container width a function of the CT browser's scrollbar mode, and this story's
 *  whole job is to be that one production width. */
export function CorpusHomeDefaultPaneStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 868.8125 }}>
        <CorpusHomeSurface />
      </div>
    </CtDataProviders>
  );
}

/** THE SAME SURFACE AT THE THREE-PANE WIDTH — list docked AND context open, the same battery's row 3:
 *  484.8125px, where one column is the right answer and the split must NOT fire. It is the control for
 *  {@link CorpusHomeDefaultPaneStory}: a split that engaged unconditionally would be a different defect,
 *  not a fix. */
export function CorpusHomeThreePaneStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 484.8125 }}>
        <CorpusHomeSurface />
      </div>
    </CtDataProviders>
  );
}

/** THE SAME SURFACE AT A PHONE-WIDTH PANE — the narrow end of the masthead's width matrix (B7: at 430px the
 *  h1 wrapped to six one-word lines beside the figure block). Mounted bare, like its two siblings above, so
 *  the measured width is the container query's input rather than the CONTENT region's inset minus a
 *  scrollbar. It is a SEPARATE story from `CorpusContentNarrowStory` — playwright-ct hoists each imported
 *  story into one generated registry, so two CT files importing the same story name collide at load. */
export function CorpusHomeNarrowPaneStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ overflow: "visible", width: 430 }}>
        <CorpusHomeSurface />
      </div>
    </CtDataProviders>
  );
}

/** THE SAME SURFACE AT A WIDE PANE — the third row of the width matrix the column-balance fix owes (side-eye
 *  corpus re-pass 2026-08-19 §5 "the right column just stops", measured at a 1224px pane). A balance property
 *  is a RANGE property, so it is pinned at the wide end, the shipped default, and the stacked end rather than
 *  at whichever width happens to agree. */
export function CorpusHomeWidePaneStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 1224 }}>
        <CorpusHomeSurface />
      </div>
    </CtDataProviders>
  );
}

/** The SAME region at the narrowest real host — a phone-width CONTENT pane. Fixed width with the pane's
 *  own overflow so a shrink-0 cluster or an un-truncated title collides here instead of on someone's phone
 *  (the 2026-08-08 "measure every row at its narrowest real mount" ruling). */
export function CorpusContentNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 740, overflow: "visible", width: 430 }}>
        <CorpusContent />
      </div>
    </CtDataProviders>
  );
}

const DOSSIER_CHARACTER = castId<CharacterId>("char_aria");

/** The Corpus CONTENT dossier over the real data layer — the ASK panel's provenance badge lives here. */
export function CorpusDossierSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 480 }}>
        <CorpusDossierSurface characterId={DOSSIER_CHARACTER} onBack={(): void => undefined} />
      </div>
    </CtDataProviders>
  );
}
