// The ONE CONTEXT-panel tab-selection resolver (HUD-1 §3.4) — the stored→`defaultTab`→declared-first rule,
// homed once so the two pane compositions cannot drift. `ContextTabsPanel` (the generic panel) and
// `ContextRegionHost` (a claimant's pane) both consume it; a second copy of this rule is exactly the drift
// this repo keeps re-learning.
//
// The rule, unchanged from the pre-HUD panel: a STORED `contextTab` wins whenever it is still visible
// (selection continuity across chat/section switches — Context-Panel-Program §4.1), else the FIRST tab
// flagged `defaultTab` (a game chat lands on Status, not the roster's Members), else the declared-order
// first. Never "nothing selected" while tabs exist.

import type { ContextRegionView, ResolvedContextTab } from "#lib";
import { setContextTab, useContextTab } from "#state";

export function useContextTabSelection(tabs: readonly ResolvedContextTab[]): Pick<ContextRegionView, "activeTab" | "selectTab"> {
  const contextTab = useContextTab();
  const fallback = (tabs.find((entry) => entry.defaultTab) ?? tabs[0])?.id ?? null;
  const visible = tabs.some((entry) => entry.id === contextTab);
  return { activeTab: contextTab !== null && visible ? contextTab : fallback, selectTab: setContextTab };
}
