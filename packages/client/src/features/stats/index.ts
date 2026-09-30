// stats/ front door — the client feature for the STATS server domain, presented as the Corpus "Insights"
// mode (the folder mirrors the domain per the client-structure gate; the surfaces keep their Analytics*
// names). The door composes `insightsCorpusMode` and `insightsContextTabs` into the Corpus section.

export type { AnalyticsListAnchorProps } from "./anchors/analytics-list-anchor.tsx";
export { AnalyticsListAnchor } from "./anchors/analytics-list-anchor.tsx";
export { AnalyticsModelsTab } from "./components/analytics-models-tab.tsx";
export { AnalyticsPersonasTab } from "./components/analytics-personas-tab.tsx";
export { AnalyticsTimeTab } from "./components/analytics-time-tab.tsx";
export { insightsContextTabs, insightsCorpusMode } from "./lib/insights-mode.tsx";
export type { AnalyticsCharacterSurfaceProps } from "./surfaces/analytics-character-surface.tsx";
export { AnalyticsCharacterSurface } from "./surfaces/analytics-character-surface.tsx";
export { AnalyticsListSurface } from "./surfaces/analytics-list-surface.tsx";
export { AnalyticsOverviewSurface } from "./surfaces/analytics-overview-surface.tsx";
