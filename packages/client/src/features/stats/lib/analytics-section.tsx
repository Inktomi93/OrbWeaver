// The Analytics rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. A pure DATA object: no app-shell/auth hook (Analytics has no isMobile-branching intent, unlike
// Characters' field-inspector reveal). The composition root assembles this into the section registry at
// the M1 cutover; until then the `/` route consumes `list` + `content` directly and the shell's
// ContextTabsPanel still serves the CONTEXT (this `context` field is populated for the cutover but not
// yet on the render path).

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve the ChartColumn glyph fine (the character-card-facets.ts precedent).
import { ChartColumn } from "@orb/ui/icons";
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
  context: {
    kind: "tabs",
    tabs: [
      { id: "models", label: "Models", body: () => <AnalyticsModelsTab /> },
      { id: "time", label: "Time", body: () => <AnalyticsTimeTab /> },
      { id: "personas", label: "Personas", body: () => <AnalyticsPersonasTab /> },
    ],
  },
};
