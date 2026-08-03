// ContextRegionHost — the ONE mount for a CLAIMED CONTEXT pane (HUD-1 §3.1/§3.2). Domain-agnostic, exactly
// like its `ContextTabsPanel` sibling: it assembles the `ContextRegionView` (the already-resolved tabs, the
// ONE selection seam, the host's strip-trail actions) and hands it to whichever contributor claimed the
// pane. It knows nothing about what the claimant renders.
//
// THE SHELL STOPS HERE. A claimed pane gets NO `.shell-panel-header` band and NO `.ctx-tab-strip` — the
// claimant composes its own band, strips and viewport (`SectionContextHeader` returns null, and shell.css
// collapses the resulting empty band; D66 A1 is suspended for a CLAIMED context panel only). What the shell
// keeps is the panel MECHANICS it has always owned: the `.shell-panel` aside, `data-panel-mode`, the width
// track, the landmark + label, the scrim, the close affordance (D62 untouched — the claim is pane CONTENT).
//
// `data-context-region` is written HERE and NOWHERE ELSE (the single-writer idiom) — it is the probe handle
// for the geometry CTs and `pnpm snap --eval`.

import type { ReactElement } from "react";
import type { ResolvedContextTabs } from "#lib";
import { useContextTabSelection } from "../hooks/use-context-tab-selection.ts";

export interface ContextRegionHostProps {
  /** The claimant's whole-pane renderer, resolved by `resolveContextTabs` (the FIRST claiming region). */
  readonly region: NonNullable<ResolvedContextTabs["region"]>;
  readonly tabs: ResolvedContextTabs["tabs"];
  readonly actions?: ResolvedContextTabs["actions"];
}

export function ContextRegionHost({ region, tabs, actions }: ContextRegionHostProps): ReactElement {
  const { activeTab, selectTab } = useContextTabSelection(tabs);
  return (
    <div data-context-region={true} className="flex h-full min-h-0 flex-col">
      {region({ tabs, activeTab, selectTab, ...(actions === undefined ? {} : { actions }) })}
    </div>
  );
}
