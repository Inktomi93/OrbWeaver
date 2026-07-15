// The Analytics rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. CONTEXT is minted via `defineContextTabs<void>` (§6b) — Analytics has no shared context state, so
// `useContextState` returns the `VOID_STATE` sentinel (always-present, unconditionally called). The
// composition root assembles this into the section registry (main.tsx); AppShell consumes it via
// `useSectionRegistry`.

import { ChartColumn } from "@orb/ui/icons";
import { defineContextTabs, VOID_STATE } from "#lib";
import type { SectionDefinition } from "#state";
import { AnalyticsListAnchor } from "../anchors/analytics-list-anchor";
import { AnalyticsContent } from "../components/analytics-content";
import { AnalyticsModelsTab } from "../components/analytics-models-tab";
import { AnalyticsPersonasTab } from "../components/analytics-personas-tab";
import { AnalyticsTimeTab } from "../components/analytics-time-tab";
import { AnalyticsListSurface } from "../surfaces/analytics-list-surface";

export const analyticsSection: SectionDefinition = {
  id: "analytics",
  rail: { label: "Analytics", icon: ChartColumn, group: "insight" },
  panelDefaults: { list: "collapsed", context: "collapsed" },
  placeholder: {
    title: "Analytics",
    description: "Charts over your corpus land here — cast time, thread connections, drift.",
  },
  list: () => (
    <AnalyticsListAnchor>
      <AnalyticsListSurface />
    </AnalyticsListAnchor>
  ),
  content: () => <AnalyticsContent />,
  // Three owner-scoped dimension tabs, always available: Models / Time / Personas.
  context: defineContextTabs<void>({
    useContextState: () => VOID_STATE,
    tabs: [
      { id: "models", label: "Models", body: () => <AnalyticsModelsTab /> },
      { id: "time", label: "Time", body: () => <AnalyticsTimeTab /> },
      { id: "personas", label: "Personas", body: () => <AnalyticsPersonasTab /> },
    ],
  }),
};
