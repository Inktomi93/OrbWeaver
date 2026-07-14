// stats/ front door — the client feature for the STATS server domain, presented as the "Analytics" rail
// section (the folder mirrors the domain per the client-structure gate; the user-facing surfaces are
// named Analytics*). The section's four regions: the LIST leaderboard navigator (sortable, drills a
// character), the CONTENT overview dashboard / per-character drill, and the CONTEXT analytics tabs
// (Models / Time / Personas) — the route wires the CONTEXT tab bodies into the shell's ContextTabsPanel.

export type { AnalyticsListAnchorProps } from "./anchors/analytics-list-anchor";
export { AnalyticsListAnchor } from "./anchors/analytics-list-anchor";
export { AnalyticsModelsTab } from "./components/analytics-models-tab";
export { AnalyticsPersonasTab } from "./components/analytics-personas-tab";
export { AnalyticsTimeTab } from "./components/analytics-time-tab";
export type { AnalyticsCharacterSurfaceProps } from "./surfaces/analytics-character-surface";
export { AnalyticsCharacterSurface } from "./surfaces/analytics-character-surface";
export { AnalyticsListSurface } from "./surfaces/analytics-list-surface";
export { AnalyticsOverviewSurface } from "./surfaces/analytics-overview-surface";
