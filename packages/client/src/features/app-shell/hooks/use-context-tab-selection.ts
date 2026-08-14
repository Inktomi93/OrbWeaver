// The ONE CONTEXT-panel tab-selection resolver (HUD-1 §3.4) — the stored→`defaultTab`→declared-first rule,
// homed once so the two pane compositions cannot drift. `ContextTabsPanel` (the generic panel) and
// `ContextRegionHost` (a claimant's pane) both consume it; a second copy of this rule is exactly the drift
// this repo keeps re-learning.
//
// The rule, unchanged from the pre-HUD panel: a STORED `contextTab` wins whenever it is still visible
// (selection continuity across chat/section switches — Context-Panel-Program §4.1), else the FIRST tab
// flagged `defaultTab` (a game chat lands on Status, not the roster's Members), else the declared-order
// first. Never "nothing selected" while tabs exist.

import { useEffect } from "react";
import type { ContextRegionView, ResolvedContextTab } from "#lib";
import { publishContextTabIds, setContextTab, useContextTab } from "#state";

/** The join/split delimiter for the published tab-id set — a comma, which a context-tab id (an identifier)
 *  can never contain, so the round-trip is lossless. */
const TAB_ID_SEP = ",";

export function useContextTabSelection(tabs: readonly ResolvedContextTab[]): Pick<ContextRegionView, "activeTab" | "selectTab"> {
  const contextTab = useContextTab();
  const fallback = (tabs.find((entry) => entry.defaultTab) ?? tabs[0])?.id ?? null;
  const visible = tabs.some((entry) => entry.id === contextTab);
  // Publish the mounted surface's tab ids so the non-rendering `__orb.nav.contextTab` bridge can validate a
  // requested tab (an opaque cross-surface string it otherwise had no way to check) — cleared on unmount so
  // a closed panel reports no tabs rather than a stale set. `tabKey` keys the effect: same ids, no re-write.
  const tabKey = tabs.map((entry) => entry.id).join(TAB_ID_SEP);
  useEffect((): (() => void) => {
    publishContextTabIds(tabKey === "" ? [] : tabKey.split(TAB_ID_SEP));
    return (): void => publishContextTabIds([]);
  }, [tabKey]);
  return { activeTab: contextTab !== null && visible ? contextTab : fallback, selectTab: setContextTab };
}
