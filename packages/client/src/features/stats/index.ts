// stats/ front door — the client feature for the STATS server domain, presented as the Corpus "Insights"
// mode (the folder mirrors the domain per the feature layout test; the surfaces keep their Analytics*
// names). The door composes `insightsCorpusMode` and `insightsContextTabs` into the Corpus section.
export {} from "./anchors/analytics-list-anchor.tsx";
export {} from "./components/analytics-models-tab.tsx";
export {} from "./components/analytics-personas-tab.tsx";
export {} from "./components/analytics-time-tab.tsx";
export { insightsContextTabs, insightsCorpusMode } from "./lib/insights-mode.tsx";
/** @public The e2e corpus workbench spec addresses a leaderboard row by this attribute through the feature door. */
export { LEADERBOARD_ROW_ATTR } from "./lib/leaderboard-row-attr.ts";
export {} from "./surfaces/analytics-character-surface.tsx";
export {} from "./surfaces/analytics-list-surface.tsx";
export {} from "./surfaces/analytics-overview-surface.tsx";
