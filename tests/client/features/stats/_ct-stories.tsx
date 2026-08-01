// Analytics (stats domain) CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test
// module). Surfaces come through the feature front door, wrapped in the real client data layer
// (CtDataProviders — Query + real tRPC over the routeTrpc-stubbed network). The N4/P4 CONTEXT-band and
// the N1/N2 LIST band mount through the REAL section registry (CtRealSectionRegistry) — the shell's own
// consumers — driving the `header`/`listHeader` slots the analytics section supplies.

import { AnalyticsListAnchor, AnalyticsListSurface, AnalyticsOverviewSurface } from "@orb/client/features/stats";
import { clearAnalyticsSelection, selectAnalyticsCharacter, useSectionRegistry } from "@orb/client/state";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { SectionContextHeader } from "../../../../packages/client/src/features/app-shell/components/section-context-host";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/ct/ct-data-providers";

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
 *  mutation). */
export function AnalyticsOverviewSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 720 }}>
        <AnalyticsOverviewSurface />
      </div>
    </CtDataProviders>
  );
}

/** A stable drilled character id the context header names (the `character.get` routeTrpc stub returns the
 *  drilled name regardless of input, so the CT needs no id handle). */
const ANALYTICS_DRILLED_ID: CharacterId = castId<CharacterId>("character_ct_analytics");

// Mounts the analytics section's CONTEXT BAND identity (N4/P4) through the real `SectionContextHeader` —
// the shell's band consumer — over the analytics `defineContextTabs` `header` slot. The `key` mirrors the
// shell's per-section remount.
function AnalyticsContextHeaderHarness(): ReactElement {
  const registry = useSectionRegistry();
  return <SectionContextHeader key="analytics" definition={registry.get("analytics")} />;
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
  readonly drilled: boolean;
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
