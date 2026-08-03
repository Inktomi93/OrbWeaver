// stats/ front door — the client feature for the STATS server domain, presented as the "Analytics" rail
// section (the folder mirrors the domain per the client-structure gate; the user-facing surfaces are
// named Analytics*). The section's four regions: the LIST leaderboard navigator (sortable, drills a
// character), the CONTENT overview dashboard / per-character drill, and the CONTEXT analytics tabs
// (Models / Time / Personas) — the route wires the CONTEXT tab bodies into the shell's ContextTabsPanel.

export type { AnalyticsListAnchorProps } from "./anchors/analytics-list-anchor.tsx";
export { AnalyticsListAnchor } from "./anchors/analytics-list-anchor.tsx";
export { AnalyticsModelsTab } from "./components/analytics-models-tab.tsx";
export { AnalyticsPersonasTab } from "./components/analytics-personas-tab.tsx";
export { AnalyticsTimeTab } from "./components/analytics-time-tab.tsx";
export { analyticsSection } from "./lib/analytics-section.tsx";
export type { AnalyticsCharacterSurfaceProps } from "./surfaces/analytics-character-surface.tsx";
export { AnalyticsCharacterSurface } from "./surfaces/analytics-character-surface.tsx";
export { AnalyticsListSurface } from "./surfaces/analytics-list-surface.tsx";
export { AnalyticsOverviewSurface } from "./surfaces/analytics-overview-surface.tsx";
