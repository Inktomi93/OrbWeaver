// The Analytics CONTENT body — a leaderboard row drilled shows that character's stats; nothing drilled
// shows the overview dashboard. Reads its OWN selection from #state so the section definition composing
// it stays a pure data object.

import type { ReactElement } from "react";
import { clearAnalyticsSelection, useSelectedAnalyticsCharacterId } from "#state";
import { AnalyticsCharacterSurface } from "../surfaces/analytics-character-surface";
import { AnalyticsOverviewSurface } from "../surfaces/analytics-overview-surface";

export function AnalyticsContent(): ReactElement {
  const selectedAnalyticsCharacterId = useSelectedAnalyticsCharacterId();
  if (selectedAnalyticsCharacterId === null) {
    return <AnalyticsOverviewSurface />;
  }
  return <AnalyticsCharacterSurface characterId={selectedAnalyticsCharacterId} onBack={clearAnalyticsSelection} />;
}
