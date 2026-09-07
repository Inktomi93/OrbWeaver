// Analytics (stats domain) CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test
// module). Surfaces come through the feature front door, wrapped in the real client data layer
// (CtDataProviders — Query + real tRPC over the routeTrpc-stubbed network). The N4/P4 CONTEXT-band and
// the N1/N2 LIST band mount through the REAL section registry (CtRealSectionRegistry) — the shell's own
// consumers — driving the `header`/`listHeader` slots the analytics section supplies.

import {
  AnalyticsCharacterSurface,
  AnalyticsListAnchor,
  AnalyticsListSurface,
  AnalyticsModelsTab,
  AnalyticsOverviewSurface,
  AnalyticsPersonasTab,
  AnalyticsTimeTab,
} from "@orb/client/features/stats";
import { clearAnalyticsSelection, selectAnalyticsCharacter, setActiveSection, setPanelMode, useSectionRegistry } from "@orb/client/state";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { SectionContextHost } from "../../../../packages/client/src/features/app-shell/components/section-context-host.tsx";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/browser/ct-data-providers.tsx";

/** The Analytics LIST leaderboard navigator over the real data layer. */
export function AnalyticsListSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 360 }}>
        <AnalyticsListAnchor>
          <AnalyticsListSurface />
        </AnalyticsListAnchor>
      </div>
    </CtDataProviders>
  );
}

/** The Analytics OVERVIEW dashboard over the real data layer (four suspense reads + the recompute
 *  mutation). Wrapped in `CtRealSectionRegistry` (#451): the top-character subtitle reads
 *  `useSectionListMode("analytics")`, which needs the real registry to resolve. */
export function AnalyticsOverviewSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: 640, width: 720 }}>
          <AnalyticsOverviewSurface />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The OVERVIEW dashboard in a pane SHORTER than its content — the #1727 fold. A reachability pin needs a
 *  guaranteed fold, and the 640px story's overflow depends on whatever the stub data happens to render;
 *  240px makes the fold a property of the story rather than of the fixture. */
export function AnalyticsOverviewSurfaceShortStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: 240, width: 720 }}>
          <AnalyticsOverviewSurface />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The same OVERVIEW dashboard with the LIST panel driver exposed (#451) — the top-character subtitle's two
 *  arms: named-affordance while collapsed, plain while the list is docked. `setActiveSection` first, because
 *  `setPanelMode` writes the CURRENT active section's override. */
export function AnalyticsOverviewSurfaceListModeStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <button
          onClick={(): void => {
            setActiveSection("analytics");
            setPanelMode("list", "collapsed");
          }}
          type="button"
        >
          collapse the list
        </button>
        <button
          onClick={(): void => {
            setActiveSection("analytics");
            setPanelMode("list", "docked");
          }}
          type="button"
        >
          dock the list
        </button>
        <div style={{ height: 640, width: 720 }}>
          <AnalyticsOverviewSurface />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The Analytics CHARACTER drill (a single character's turn economics) over the real data layer.
 *  `onBack` is a no-op here — the CT asserts what renders, not the navigation the shell owns. */
export function AnalyticsCharacterSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 720 }}>
        <AnalyticsCharacterSurface characterId={castId<CharacterId>("character_ct_drill")} onBack={(): void => undefined} />
      </div>
    </CtDataProviders>
  );
}

/** The Analytics CONTEXT tab bodies over the real data layer. The width is the CONTEXT panel's, which is
 *  where their rows and charts are actually narrow. */
export function AnalyticsTimeTabStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 420 }}>
        <AnalyticsTimeTab />
      </div>
    </CtDataProviders>
  );
}

/** A stable drilled character id the context header names (the `character.get` routeTrpc stub returns the
 *  drilled name regardless of input, so the CT needs no id handle). */
const ANALYTICS_DRILLED_ID: CharacterId = castId<CharacterId>("character_ct_analytics");

// Mounts the analytics section's CONTEXT bracket through the real `SectionContextHost`; tabbed contexts
// own their header inside that bracket, while the outer shell band deliberately stays empty.
function AnalyticsContextHeaderHarness(): ReactElement {
  const registry = useSectionRegistry();
  return (
    <div style={{ height: 640, width: 420 }}>
      <SectionContextHost key="analytics" definition={registry.get("analytics")} />
    </div>
  );
}

// Mounts the analytics section's LIST band (N1/N2) through the real registry's `listHeader()` slot — the
// same call the shell's `PanelChrome` makes for the list panel.
function AnalyticsListHeaderHarness(): ReactElement {
  const registry = useSectionRegistry();
  const listHeader = registry.get("analytics").listHeader;
  return <div style={{ width: 320 }}>{listHeader?.()}</div>;
}

export interface AnalyticsContextHeaderStoryProps {
  /** `true` seeds a leaderboard drill (the header names the character); `false` clears it (neutral). */
  readonly drilled?: boolean;
}

/** The analytics CONTEXT-band identity (P4): a drilled leaderboard character names the band (avatar +
 *  name via `character.get`); nothing drilled shows the neutral "Analytics" identity — end-to-end through
 *  the real section → mint → `SectionContextHeader` path. */
export function AnalyticsContextHeaderStory({ drilled }: AnalyticsContextHeaderStoryProps): ReactElement {
  useEffect(() => {
    if (drilled) {
      selectAnalyticsCharacter(ANALYTICS_DRILLED_ID);
    } else {
      clearAnalyticsSelection();
    }
    return (): void => clearAnalyticsSelection();
  }, [drilled]);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <AnalyticsContextHeaderHarness />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** Drives the drill selection the CONTEXT tabs read, then renders `children`. The selection is client
 *  state (`#state`), not a prop, so a CT that wants the DRILLED arm has to set it the way the leaderboard
 *  does. Seeded in an effect and cleared on unmount, mirroring the context-header story above. */
function WithDrill({ drilled, children }: { readonly drilled: boolean; readonly children: ReactElement }): ReactElement {
  useEffect(() => {
    if (drilled) {
      selectAnalyticsCharacter(ANALYTICS_DRILLED_ID);
    } else {
      clearAnalyticsSelection();
    }
    return (): void => clearAnalyticsSelection();
  }, [drilled]);
  return children;
}

export interface AnalyticsTabStoryProps {
  /** `true` seeds a leaderboard drill — the state each CONTEXT tab must answer for honestly. */
  readonly drilled?: boolean;
}

/** The CONTEXT "Models" tab in either drill state (P1b): the model rollup has no character axis, so the
 *  drilled arm must say so and must NOT render a second, owner-scoped copy of CONTENT's latency quartet. */
export function AnalyticsModelsTabStory({ drilled = false }: AnalyticsTabStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <WithDrill drilled={drilled}>
        <div style={{ height: 640, width: 420 }}>
          <AnalyticsModelsTab />
        </div>
      </WithDrill>
    </CtDataProviders>
  );
}

/** The CONTEXT "Personas" tab in either drill state (P1b): `personaUsage` is a live canon GROUP BY, so
 *  the drilled arm SCOPES (it does not merely caption). */
export function AnalyticsPersonasTabStory({ drilled = false }: AnalyticsTabStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <WithDrill drilled={drilled}>
        <div style={{ height: 640, width: 420 }}>
          <AnalyticsPersonasTab />
        </div>
      </WithDrill>
    </CtDataProviders>
  );
}

/** The analytics LIST band (N1/N2): the "Analytics" title + the leaderboard count, over the stubbed
 *  network (`stats.leaderboard` supplies the census the count reads). Read-only ⇒ NO New action. */
export function AnalyticsListHeaderStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <AnalyticsListHeaderHarness />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}
