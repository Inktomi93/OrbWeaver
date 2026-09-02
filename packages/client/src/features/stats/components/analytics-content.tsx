// The Analytics CONTENT body — a leaderboard row drilled shows that character's stats; nothing drilled
// shows the overview dashboard. Reads its OWN selection from #state so the section definition composing
// it stays a pure data object.
//
// NO SCROLL/INSET WRAPPER HERE ON PURPOSE (#1200): each of the two surfaces below owns its own scroll axis
// and inset — see `analytics-overview-surface.tsx`'s header for why that differs from the Corpus content
// precedent this fix otherwise follows.

import type { ReactElement } from "react";
import { clearAnalyticsSelection, useSelectedAnalyticsCharacterId } from "#state";
import { AnalyticsCharacterSurface } from "../surfaces/analytics-character-surface.tsx";
import { AnalyticsOverviewSurface } from "../surfaces/analytics-overview-surface.tsx";

export function AnalyticsContent(): ReactElement {
  const selectedAnalyticsCharacterId = useSelectedAnalyticsCharacterId();
  if (selectedAnalyticsCharacterId === null) {
    return <AnalyticsOverviewSurface />;
  }
  return <AnalyticsCharacterSurface characterId={selectedAnalyticsCharacterId} onBack={clearAnalyticsSelection} />;
}
