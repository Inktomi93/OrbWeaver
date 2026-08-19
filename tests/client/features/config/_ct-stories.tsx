// config feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
//
// The story assembles the REAL door array (`tagCollection` + `regexCollection` + `worldInfoCollection`) into a real
// `config-collections` registry and mounts the three panes the shell would mount, so the CTs drive the
// production seam end to end: host frame → contribution rows → kinded selection → contribution editor →
// contribution context. Nothing here is a test double.
//
// The `reset groups` button is determinism, not product: the disclosure store is device-local
// (localStorage), and a CT that inherited another run's expanded set would assert the wrong first frame.

import type { CollectionContribution } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import { __resetCollectionGroupOpen, clearCollectionSelection } from "@orb/client/state";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfigContextBody, ConfigContextHeader } from "../../../../packages/client/src/features/config/components/config-context-body.tsx";
import { ConfigContentSurface } from "../../../../packages/client/src/features/config/surfaces/config-content-surface.tsx";
import { ConfigRosterSurface } from "../../../../packages/client/src/features/config/surfaces/config-roster-surface.tsx";
import { regexCollection } from "../../../../packages/client/src/features/regex/index.ts";
import { tagCollection } from "../../../../packages/client/src/features/tag/index.ts";
import { worldInfoCollection } from "../../../../packages/client/src/features/world-info/index.ts";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

const collections = createContributorRegistry<CollectionContribution>("config-collections", [tagCollection, regexCollection, worldInfoCollection]);

/** The roster's content box at the NARROWEST real docked LIST pane: `--dimension-panel` clamps at 17rem
 *  (272px) and the panel body pays its own inline padding out of that. Measured, not guessed — the band's
 *  longest kicker ("Regex scripts", on the one collection that also draws all three trailing verbs) needed
 *  273px of this box and the pane gives 271, which is the two pixels the sweep saw go to an ellipsis. The
 *  shared workspace story runs a roomier 330px and cannot see it. */
const NARROW_ROSTER_PX = 271;

export function ConfigRosterNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <button
        type="button"
        onClick={(): void => {
          __resetCollectionGroupOpen();
          clearCollectionSelection();
        }}
      >
        reset groups
      </button>
      <div style={{ overflow: "hidden", width: NARROW_ROSTER_PX }}>
        <ConfigRosterSurface collections={collections} />
      </div>
    </CtDataProviders>
  );
}

/** The roster's content box at the DEFAULT docked LIST pane — the state a reader arrives in (CONTEXT
 *  collapsed, LIST docked), measured on the live app at 307px. The narrow story above is the OTHER end of
 *  the range (both panes open); a row-width fix has to hold at BOTH, because a point measurement never
 *  proves a range property. */
const DEFAULT_ROSTER_PX = 307;

export function ConfigRosterDefaultStory(): ReactElement {
  return (
    <CtDataProviders>
      <button
        type="button"
        onClick={(): void => {
          __resetCollectionGroupOpen();
          clearCollectionSelection();
        }}
      >
        reset groups
      </button>
      <div style={{ overflow: "hidden", width: DEFAULT_ROSTER_PX }}>
        <ConfigRosterSurface collections={collections} />
      </div>
    </CtDataProviders>
  );
}

/** ARRIVING IN THE WHOLE SECTION — the LIST roster and the CONTENT region mounting TOGETHER on a BOUNCE,
 *  which is what a rail switch does. `useFocusOnMount` deliberately declines on a COLD load (activeElement
 *  is `<body>`), so a plain mount cannot see this at all; and a roster-only mount has no competitor, so it
 *  cannot see it either. CONTENT mounts second here, exactly as the shell mounts it — the one arrangement
 *  in which "the content pane steals the section's arrival focus" exists. (The corpus
 *  `CorpusSectionArrivalStory` precedent, re-spelled for this workspace.) */
export function ConfigSectionArrivalStory(): ReactElement {
  const [inConfig, setInConfig] = useState(true);
  return (
    <CtDataProviders>
      <button type="button" onClick={(): void => setInConfig((here) => !here)}>
        {inConfig ? "Leave Configuration" : "Back to Configuration"}
      </button>
      <div style={{ display: "flex", height: 640, width: 900 }}>
        {inConfig ? (
          <>
            <div style={{ width: 330 }}>
              <ConfigRosterSurface collections={collections} />
            </div>
            <div style={{ flex: 1 }}>
              <ConfigContentSurface collections={collections} />
            </div>
          </>
        ) : (
          <p>Another section</p>
        )}
      </div>
    </CtDataProviders>
  );
}

/** The CONTENT pane at the width it actually gets in production — measured 2026-08-16 on the live app
 *  with the LIST docked and the CONTEXT collapsed, which is the default `panelDefaults` this section
 *  declares. It is the width the Hearth split has to engage at (`cols="lead"` breathes at the `@4xl`
 *  container step, 56rem/896px), so a roomier story would prove the split somewhere the user never is. */
const CONTENT_PANE_PX = 917;

/** The CONTENT pane ALONE at its real width — the welcome's own geometry, with no roster beside it to
 *  steal the pane. The corpus is the CT's `routeTrpc` stubs, so one story drives every corpus state
 *  (built · not built · the cold first run where nothing is). */
export function ConfigWelcomeStory(): ReactElement {
  return (
    <CtDataProviders>
      <button
        type="button"
        onClick={(): void => {
          __resetCollectionGroupOpen();
          clearCollectionSelection();
        }}
      >
        reset groups
      </button>
      {/* The inner `flex: 1` is load-bearing, not ceremony (it is also what the workspace story does): the
          surface's root `<Container>` is `h-full` with no width of its own, so as a bare flex ITEM it
          shrinks to its content and the whole pane renders at ~26px — every geometry assertion then reads
          zero and the surface measures as `hidden`. */}
      <div style={{ display: "flex", height: 752, width: CONTENT_PANE_PX }}>
        <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
          <ConfigContentSurface collections={collections} />
        </div>
      </div>
    </CtDataProviders>
  );
}

/** The whole Configuration workspace: LIST roster · CONTENT · CONTEXT, over the real collections. */
export function ConfigWorkspaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <button
        type="button"
        onClick={(): void => {
          __resetCollectionGroupOpen();
          clearCollectionSelection();
        }}
      >
        reset groups
      </button>
      <div style={{ display: "flex", height: 700, width: 1100 }}>
        <div style={{ overflow: "auto", width: 330 }}>
          <ConfigRosterSurface collections={collections} />
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          <ConfigContentSurface collections={collections} />
        </div>
        {/* The CONTEXT pane as the SHELL assembles it: the definition's `header` in the band, its `body`
            below. Mounting the body alone hid a defect only the PAIR shows — the band echoing the body's own
            empty-state title, so one pane stated one fact twice. `header` may decline (render nothing), which
            in production resolves to the shell's neutral band; the story keeps the slot so the pair is
            addressable either way. */}
        <div data-slot="ct-config-context-pane" style={{ overflow: "auto", width: 360 }}>
          <div data-slot="ct-config-context-band">
            <ConfigContextHeader collections={collections} />
          </div>
          <ConfigContextBody collections={collections} />
        </div>
      </div>
    </CtDataProviders>
  );
}
