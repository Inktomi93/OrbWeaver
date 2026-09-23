// The ONE CONTEXT-panel tab-selection resolver (HUD-1 §3.4) — the stored→`defaultTab`→declared-first rule,
// homed once. `ContextTabsPanel` (the one host of the context bracket, #860) consumes it; it used to be
// shared with the deleted `ContextRegionHost`, and it stays its own module so a second pane composition
// could never mint a second copy of this rule — exactly the drift this repo keeps re-learning.
//
// The rule, unchanged from the pre-HUD panel: a STORED `contextTab` wins whenever it is still visible
// (selection continuity across chat/section switches), else the FIRST tab
// flagged `defaultTab` (a game chat lands on Status, not the roster's Members), else the declared-order
// first. Never "nothing selected" while tabs exist.

import { useEffect } from "react";
import type { ContextRegionView, ResolvedContextTab } from "#lib";
import { publishContextTabs, setContextTab, useContextTab } from "#state";

export function useContextTabSelection(tabs: readonly ResolvedContextTab[]): Pick<ContextRegionView, "activeTab" | "selectTab"> {
  const contextTab = useContextTab();
  const fallback = (tabs.find((entry) => entry.defaultTab) ?? tabs[0])?.id ?? null;
  const visible = tabs.some((entry) => entry.id === contextTab);
  // Publish the mounted surface's tab ids so the non-rendering `__orb.nav.contextTab` bridge can validate a
  // requested tab (an opaque cross-surface string it otherwise had no way to check) — cleared on unmount so
  // a closed panel reports no tabs rather than a stale set. `tabKey` keys the effect: same ids, no re-write.
  const tabKey = JSON.stringify(tabs.map(({ id, label }) => ({ id, label })));
  useEffect((): (() => void) => {
    publishContextTabs(JSON.parse(tabKey) as Array<{ id: string; label: string }>);
    return (): void => publishContextTabs([]);
  }, [tabKey]);
  return { activeTab: contextTab !== null && visible ? contextTab : fallback, selectTab: setContextTab };
}
