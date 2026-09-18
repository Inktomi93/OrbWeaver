// The Analytics rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, list-band header, content, and CONTEXT
// model in one place. CONTEXT is minted via `defineContextTabs<AnalyticsContextState>` (§6b): the three
// dimension tabs (Models/Time/Personas) are owner-scoped and IGNORE the state; the state exists only so
// the definition-owned `header` slot names the leaderboard-drilled character (north-star §6.3 — the
// Content ↔ Context bind). `useAnalyticsContextState` reads the drill selection from #state and is
// always-present (never `null`), so the owner-scoped tabs stay unconditionally available. The composition
// root assembles this into the section registry (main.tsx); AppShell consumes it via `useSectionRegistry`.

import { ChartColumn } from "@orb/ui/icons";
import type { AnalyticsContextState } from "#lib";
import { defineContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { analyticsSectionSelection, useSelectedAnalyticsCharacterId } from "#state";
import { AnalyticsListAnchor } from "../anchors/analytics-list-anchor.tsx";
import { AnalyticsContent } from "../components/analytics-content.tsx";
import { AnalyticsContextHeader } from "../components/analytics-context-header.tsx";
import { AnalyticsListHeader } from "../components/analytics-list-header.tsx";
import { AnalyticsModelsTab } from "../components/analytics-models-tab.tsx";
import { AnalyticsPersonasTab } from "../components/analytics-personas-tab.tsx";
import { AnalyticsTimeTab } from "../components/analytics-time-tab.tsx";
import { AnalyticsListSurface } from "../surfaces/analytics-list-surface.tsx";
import { ANALYTICS_SECTION_LABEL } from "./analytics-section-label.ts";
import { useAnalyticsSelectionTitle } from "./analytics-selection-title.ts";

/** The Analytics context-state projection: the leaderboard-drilled character (`null` = the overview
 *  dashboard). Always-present so the owner-scoped tabs stay unconditionally available; the `header` slot
 *  is its only reader. A module-level named hook — the `defineContextTabs` rules-of-hooks contract. */
function useAnalyticsContextState(): AnalyticsContextState {
  // @orb-waive no-raw-id(characterId): the hook returns a branded CharacterId from zustand state; the gate's reader cannot trace through the selector chain; ends when the gate resolves zustand selectors
  return { characterId: useSelectedAnalyticsCharacterId() };
}

export const analyticsSection: SectionDefinition = {
  id: "analytics",
  rail: { label: ANALYTICS_SECTION_LABEL, icon: ChartColumn, group: "insight", mobile: "sheet" },
  panelDefaults: { list: "collapsed", context: "collapsed" },
  placeholder: {
    title: "Analytics",
    description: "Charts over your corpus land here — character time, thread connections, drift.",
  },
  list: () => (
    <AnalyticsListAnchor>
      <AnalyticsListSurface />
    </AnalyticsListAnchor>
  ),
  // The LIST chrome-band content (§4 N1/N2, §6.3): "ANALYTICS" title + leaderboard count. Read-only ⇒ no
  // create action (the band is a census, not an addition).
  listHeader: () => <AnalyticsListHeader />,
  // How the SHELL reads "is a character drilled?" — the mobile ONE-SHELL rule's input + back affordance.
  selection: analyticsSectionSelection,
  // …and what it calls the drilled character in the pushed frame's topbar.
  useSelectionTitle: useAnalyticsSelectionTitle,
  content: () => <AnalyticsContent />,
  // Three owner-scoped dimension tabs, always available: Models / Time / Personas. The `header` slot names
  // the drilled character; the tabs ignore the state (owner-scoped).
  context: defineContextTabs<AnalyticsContextState>({
    useContextState: useAnalyticsContextState,
    tabs: [
      { id: "models", label: "Models", body: () => <AnalyticsModelsTab /> },
      { id: "time", label: "Time", body: () => <AnalyticsTimeTab /> },
      { id: "personas", label: "Personas", body: () => <AnalyticsPersonasTab /> },
    ],
    // The CONTEXT-panel BAND identity (N4/P4) — the leaderboard-drilled character, definition-owned.
    header: (state) => <AnalyticsContextHeader state={state} />,
  }),
};
