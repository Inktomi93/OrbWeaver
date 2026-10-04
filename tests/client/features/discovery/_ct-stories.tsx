// Discovery (Corpus section) CT stories (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test
// module). Surfaces come through the feature front door, wrapped in the real client data layer
// (CtDataProviders — Query + real tRPC over the routeTrpc-stubbed network).

import { ListPaneHeaderHost } from "@orb/client/components";
import { useInvalidation, useTRPC } from "@orb/client/data";
import { CommandPaletteSurface } from "@orb/client/features/chat";
import {
  CorpusArchetypesTab,
  CorpusCompareTab,
  CorpusContent,
  CorpusContextHeader,
  CorpusDossierSurface,
  CorpusHomeSurface,
  CorpusListSurface,
  CorpusMapTab,
  CorpusSimilarityTab,
  CorpusUnderstandingInvitation,
  corpusModePaletteSource,
  useCorpusListHeader,
} from "@orb/client/features/discovery";
import type { CommandPaletteSource, CorpusDestination } from "@orb/client/lib";
import { corpusDestinationIdentity, createContributorRegistry } from "@orb/client/lib";
import {
  CommandPaletteSourceRegistryProvider,
  readCorpusResultScroll,
  selectCorpusArtifact,
  setCorpusResultScroll,
  useActiveChatId,
  useActiveSection,
  useChatMoment,
  useConfigTarget,
  useSelectedCorpusDestination,
} from "@orb/client/state";
import type { CharacterId, ThemeClusterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
// Reach the shell's internal host, rather than restamping its registry-derived inset in a story.
import { SectionContent } from "../../../../packages/client/src/features/app-shell/components/section-content.tsx";
import { CorpusArtifactContext } from "../../../../packages/client/src/features/discovery/components/corpus-artifact-context.tsx";
import { CorpusSearchDisclosure } from "../../../../packages/client/src/features/discovery/components/corpus-search-disclosure.tsx";
import { CorpusSearchResults } from "../../../../packages/client/src/features/discovery/components/corpus-search-results.tsx";
import { CorpusThemeSection } from "../../../../packages/client/src/features/discovery/components/corpus-theme-section.tsx";
import { CorpusArtifactSurface } from "../../../../packages/client/src/features/discovery/surfaces/corpus-artifact-surface.tsx";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/browser/ct-data-providers.tsx";

// The theme rows the overview hands the section, spelled at the REAL prop type so a field added to
// `discovery.home`'s theme projection breaks this module at compile time rather than surviving as a hole.
type ThemeRows = Parameters<typeof CorpusThemeSection>[0]["sceneThemes"];
const THEME_PROVENANCE = { model: "ct-distiller", computedAt: 0 };
const SCENE_THEMES: ThemeRows = [
  { ...THEME_PROVENANCE, id: castId<ThemeClusterId>("theme_scene_0"), clusterIdx: 0, level: "scene", name: "A bargain at the crossroads", size: 12 },
  { ...THEME_PROVENANCE, id: castId<ThemeClusterId>("theme_scene_1"), clusterIdx: 1, level: "scene", name: "The map changes hands", size: 7 },
];
const ARC_THEMES: ThemeRows = [
  { ...THEME_PROVENANCE, id: castId<ThemeClusterId>("theme_arc_0"), clusterIdx: 0, level: "arc", name: "The long road home", size: 21 },
];

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
  const destination = useSelectedCorpusDestination();
  const moment = useChatMoment(useActiveChatId());
  return (
    <>
      <div data-testid="ct-nav-readout">
        section:{useActiveSection()} chat:{useActiveChatId() ?? "none"} artifact:{destination?.kind ?? "none"}
      </div>
      <output data-testid="ct-source-readout">{moment === null ? "none" : JSON.stringify(moment.target)}</output>
      <output data-testid="ct-artifact-identity">{destination === null ? "none" : corpusDestinationIdentity(destination)}</output>
    </>
  );
}

/** Where a corpus empty state's door landed: the config deep-link target and the active section, as text a
 *  CT can assert (the nav store is module-private). Rides beside the empty-state mounts below. */
function DoorLandingReadout(): ReactElement {
  const target = useConfigTarget();
  return (
    <output data-testid="ct-door-landing">
      section:{useActiveSection()} target:{target === null ? "none" : `${target.group}/${target.sub ?? "-"}`}
    </output>
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

/** The server's `corpusRecomputed` frame as `use-user-bus` hands it to the invalidation seam: the last hop only. */
function CorpusRecomputedTick(): ReactElement {
  const invalidation = useInvalidation();
  return (
    <button type="button" onClick={(): void => invalidation.invalidateUser({ type: "corpusRecomputed" })}>
      corpus recomputed
    </button>
  );
}

/** The Corpus LIST navigator beside a user-bus `corpusRecomputed` tick, for what a promotion announces. */
export function CorpusListSurfaceBusStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 360 }}>
        <CorpusListSurface />
      </div>
      <CorpusRecomputedTick />
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

export function CorpusArtifactReaderStory({ destination, width = 720 }: { readonly destination: CorpusDestination; readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <button type="button" onClick={(): void => selectCorpusArtifact(destination)}>
          Select evidence
        </button>
        <SelectedArtifactStoryBody />
        <CorpusArtifactContext />
        <NavReadout />
        <MomentReadout />
      </div>
    </CtDataProviders>
  );
}

export function CorpusEmbeddedResultsStory(): ReactElement {
  const [position, setPosition] = useState(0);
  return (
    <CtDataProviders>
      <button type="button" onClick={(): void => setCorpusResultScroll(240)}>
        Remember finder position
      </button>
      <button type="button" onClick={(): void => setPosition(readCorpusResultScroll())}>
        Read finder position
      </button>
      <output data-testid="ct-finder-position">{position}</output>
      <div style={{ width: 360, height: 200, display: "flex", flexDirection: "column" }}>
        <CorpusSearchResults query="embedded evidence" targetId="digests" />
      </div>
    </CtDataProviders>
  );
}

function MomentReadout(): ReactElement {
  const moment = useChatMoment(useActiveChatId());
  if (moment === null) {
    return <output data-testid="ct-moment-readout">none</output>;
  }
  return <output data-testid="ct-moment-readout">{moment.target.kind === "message" ? `message:${moment.target.messageId}` : moment.target.kind}</output>;
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
      <NavReadout />
    </CtDataProviders>
  );
}

/** ARRIVING IN THE WHOLE SECTION (P2-4) — the LIST pane and the CONTENT region mounting TOGETHER, on a
 *  bounce, which is what a rail switch does. The C7 story cannot see this defect: focus-on-mount is a race
 *  between the two panes' effects, and a list-only mount has no competitor. CONTENT mounts second here, as
 *  it does in the shell. */
export function CorpusSectionArrivalStory(): ReactElement {
  const [inCorpus, setInCorpus] = useState(true);
  return (
    <CtDataProviders>
      <button type="button" onClick={(): void => setInCorpus((here) => !here)}>
        {inCorpus ? "Leave Corpus" : "Back to Corpus"}
      </button>
      <div style={{ display: "flex", height: 640, width: 900 }}>
        {inCorpus ? (
          <>
            <div style={{ width: 360 }}>
              <CorpusListSurface />
            </div>
            <div style={{ flex: 1 }}>
              <CorpusContent />
            </div>
          </>
        ) : (
          <p>Another section</p>
        )}
      </div>
    </CtDataProviders>
  );
}

/** The Corpus LIST chrome-band header (title + distilled count) over the real data layer. */
export function CorpusListHeaderStory(): ReactElement {
  return (
    <CtDataProviders>
      <ListPaneHeaderHost useView={useCorpusListHeader} />
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
      <DoorLandingReadout />
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
      <DoorLandingReadout />
    </CtDataProviders>
  );
}

/** The Corpus CONTEXT "Compare" tab over the real data layer. */
export function CorpusCompareTabStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 420 }}>
        <CorpusCompareTab />
        <SelectedArtifactStoryBody />
      </div>
    </CtDataProviders>
  );
}

/** A catalog refetch must keep the picker names of selections outside the replacement page. */
export function CorpusCompareCatalogRefreshStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 420 }}>
        <CorpusCompareTab />
        <CatalogRefreshControl />
      </div>
    </CtDataProviders>
  );
}

function CatalogRefreshControl(): ReactElement {
  const trpc = useTRPC();
  const client = useQueryClient();
  return (
    <button type="button" onClick={(): void => void client.invalidateQueries(trpc.discovery.browseCharacters.pathFilter())}>
      Refresh catalog
    </button>
  );
}

/** The bare Corpus body owns vertical scroll, not the shell's registry-derived inline inset. */
export function CorpusContentStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 720 }}>
        <CorpusContent />
      </div>
    </CtDataProviders>
  );
}

/** The actual shell host resolves Corpus's contentInset from the real section registry. A fixed host
 *  makes token padding and the body's inset geometry observable without mounting unrelated shell chrome. */
export function CorpusContentInsetStory(): ReactElement {
  const focusAnchorRef = useRef<HTMLElement | null>(null);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: 640, width: 720 }}>
          <SectionContent activeSection="corpus" contentBySection={{ corpus: <CorpusContent /> }} fallback={null} focusAnchorRef={focusAnchorRef} />
        </div>
      </CtRealSectionRegistry>
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

/** Holds the overview back until the workload QUEUE read has settled — the only way to render the surface
 *  with a WARM queue beside an in-flight analytics read.
 *
 *  WHY IT HAS TO EXIST: our tRPC client is `httpBatchLink`, so one tick of reads is ONE HTTP response and a
 *  `trpcHold` on any member holds the whole batch (route-trpc.ts states this at length). The overview fires
 *  `workloads.list` and `discovery.topKeywords` in the SAME tick, so holding the keyword read inside a plain
 *  mount also holds the queue read — and the rail then honestly reads "not run", which is the state that
 *  CANNOT show the defect. Priming the queue in an earlier tick puts the two in different batches: when the
 *  surface finally mounts, its own `workloads.list` is a cache hit and the keyword read is the only thing in
 *  flight. Non-exported: the stories module publishes components to the CT loader (this one rides inside
 *  {@link CorpusHomeWarmQueueStory}). */
function WarmQueueGate({ children }: { readonly children: ReactNode }): ReactElement {
  const trpc = useTRPC();
  const runs = useQuery(trpc.workloads.list.queryOptions({}));
  if (runs.data === undefined) {
    return <div data-testid="ct-queue-cold">warming the queue…</div>;
  }
  return <>{children}</>;
}

/** THE OVERVIEW AT THE OWNER'S DEFAULT PANE WIDTH, MOUNTED ON A WARM QUEUE — the mount that can hold one
 *  below-fold analytics read while the rail already KNOWS that pass has succeeded. That combination is the
 *  whole of issue #384: the readiness row fed an un-answered read into the measurement branch and printed a
 *  result the surface did not have. See {@link WarmQueueGate} for why the priming tick is load-bearing. */
export function CorpusHomeWarmQueueStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 868.8125 }}>
        <WarmQueueGate>
          <CorpusHomeSurface />
        </WarmQueueGate>
      </div>
    </CtDataProviders>
  );
}

/** Populated synthetic corpus overview: findings, null-cost routes, and multi-page populations expose
 *  states a small empty fixture cannot. Stories use the normal read seams, not privileged database access.
 */
export function CorpusHomePopulatedStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 868.8125 }}>
        <CorpusHomeSurface />
      </div>
    </CtDataProviders>
  );
}

/** The Corpus CONTEXT "Similarity" tab at the CONTEXT pane's real width — the tab whose 1,782-row edge list
 *  buried its three duplicate sections 52,151px down (#554). Mounted at the pane width because the IA claim
 *  ("the duplicate findings are within one viewport of the tab top") is a GEOMETRY claim about that pane. */
export function CorpusSimilarityTabStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ display: "flex", flexDirection: "column", height: 640, width: 420 }}>
        <CorpusSimilarityTab />
      </div>
    </CtDataProviders>
  );
}

/** Similarity opens readable pair CONTENT; its cold Compare picker remains observable before selection. */
export function CorpusSimilarityToContentStory(): ReactElement {
  return (
    <CtDataProviders>
      <SimilarityContentPanels />
      <NavReadout />
    </CtDataProviders>
  );
}

function SimilarityContentPanels(): ReactElement {
  const destination = useSelectedCorpusDestination();
  return (
    <div style={{ display: "flex", height: 640, width: 900 }}>
      <div style={{ display: "flex", flexDirection: "column", width: 420 }}>
        <CorpusSimilarityTab />
      </div>
      <div data-slot="ct-pair-content" style={{ display: "flex", flexDirection: "column", width: 420 }}>
        {destination === null ? <CorpusCompareTab /> : <CorpusArtifactSurface destination={destination} />}
      </div>
    </div>
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

/** The Corpus CONTENT dossier over the real data layer — the ASK panel's provenance badge lives here. Counts
 *  `onBack` calls beside the door landing, so the unavailable state's two exits are both provable. */
export function CorpusDossierSurfaceStory(): ReactElement {
  const [backs, setBacks] = useState(0);
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 480 }}>
        <CorpusDossierSurface characterId={DOSSIER_CHARACTER} onBack={(): void => setBacks((n) => n + 1)} />
      </div>
      <DoorLandingReadout />
      <output data-testid="ct-dossier-backs">{backs}</output>
    </CtDataProviders>
  );
}

/** The omnibox's LEXICAL branch (`search.fields`), mounted directly on the `fields` target. Direct rather
 *  than through the omnibox: driving the target through the surface's chip row would put four unrelated
 *  ambient reads between the test and the branch's own naming and retry claims. */
export function CorpusFieldsSearchStory({ query = "crimson" }: { readonly query?: string } = {}): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 600, width: 420 }}>
        <CorpusSearchResults query={query} targetId="fields" />
      </div>
    </CtDataProviders>
  );
}

/** The overview's STORY-THEME section with its two theme lists supplied directly (the surface passes exactly
 *  these two props off `discovery.home`), plus a tail sentinel under it (#1726).
 *
 *  The section's drill-in card carries `reserveKey="corpus.themeDetail"`, and the defect that key exists for
 *  is a SECOND pick: the card re-suspends on every theme you open, and unreserved it collapsed to a sentence
 *  and shoved everything below it up and back. So the story renders the section inside a column with content
 *  beneath — the reservation is only observable as the absence of that shove, and a content-sized mount with
 *  nothing under the card cannot see it at all. Both lists are populated because an empty section renders
 *  `null` by design. */
export function CorpusThemeSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720, padding: 16 }}>
        <CorpusThemeSection arcThemes={ARC_THEMES} sceneThemes={SCENE_THEMES} />
        <SelectedArtifactStoryBody />
        <div data-testid="corpus-themes-tail" style={{ height: 8 }} />
      </div>
    </CtDataProviders>
  );
}

function SelectedArtifactStoryBody(): ReactElement | null {
  const destination = useSelectedCorpusDestination();
  return destination === null ? null : <CorpusArtifactSurface destination={destination} />;
}

/** The ⌘K palette with the Corpus mode source, as the door assembles it (D271). */
export function CorpusModePaletteStory(): ReactElement {
  const registry = createContributorRegistry<CommandPaletteSource>("command-palette-sources", [corpusModePaletteSource]);
  return (
    <CtDataProviders>
      <CommandPaletteSourceRegistryProvider value={registry}>
        <div style={{ height: 480, width: 560 }}>
          <CommandPaletteSurface goToSections={[]} />
        </div>
      </CommandPaletteSourceRegistryProvider>
    </CtDataProviders>
  );
}

export function CorpusSearchDisclosureStory({ width }: { readonly width: number }): ReactElement {
  return (
    <div style={{ width }}>
      <CorpusSearchDisclosure
        result={{
          over: "discover",
          hits: [],
          standaloneSegments: [],
          coverage: { requestLimit: 40, candidateLimit: 400, evidencePerCharacter: 3, reranked: false },
        }}
      />
    </div>
  );
}
