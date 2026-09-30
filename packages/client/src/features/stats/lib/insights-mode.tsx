// The Corpus Insights mode (D271): the stats leaderboard as its finder, the dashboard and character drill as
// its CONTENT, and the owner-scoped Models / Time / Personas tabs as its CONTEXT. The door hands these to
// `makeCorpusSection`, so discovery never imports stats.

import type { ContextTabDef, CorpusContextState, CorpusModeContribution } from "#lib";
import { AnalyticsListAnchor } from "../anchors/analytics-list-anchor.tsx";
import { AnalyticsContent } from "../components/analytics-content.tsx";
import { AnalyticsContextHeader } from "../components/analytics-context-header.tsx";
import { AnalyticsListHeader } from "../components/analytics-list-header.tsx";
import { AnalyticsModelsTab } from "../components/analytics-models-tab.tsx";
import { AnalyticsPersonasTab } from "../components/analytics-personas-tab.tsx";
import { AnalyticsTimeTab } from "../components/analytics-time-tab.tsx";
import { AnalyticsListSurface } from "../surfaces/analytics-list-surface.tsx";
import { useAnalyticsSelectionTitle } from "./analytics-selection-title.ts";

export const insightsCorpusMode: CorpusModeContribution = {
  list: () => (
    <AnalyticsListAnchor>
      <AnalyticsListSurface />
    </AnalyticsListAnchor>
  ),
  listHeader: () => <AnalyticsListHeader />,
  content: () => <AnalyticsContent />,
  contextHeader: () => <AnalyticsContextHeader />,
  useSelectionTitle: useAnalyticsSelectionTitle,
};

const isInsights = (state: CorpusContextState): boolean => state.mode === "insights";

/** The owner-scoped dimension tabs; they ignore the drill and show only while Insights is active. */
export const insightsContextTabs: readonly ContextTabDef<CorpusContextState>[] = [
  { id: "models", label: "Models", when: isInsights, body: () => <AnalyticsModelsTab /> },
  { id: "time", label: "Time", when: isInsights, body: () => <AnalyticsTimeTab /> },
  { id: "personas", label: "Personas", when: isInsights, body: () => <AnalyticsPersonasTab /> },
];
