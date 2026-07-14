// Analytics (stats domain) CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test
// module). Surfaces come through the feature front door, wrapped in the real client data layer
// (CtDataProviders — Query + real tRPC over the routeTrpc-stubbed network).

import { AnalyticsListAnchor, AnalyticsListSurface } from "@orb/client/features/stats";
import type { ReactElement } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

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
