// THE CONTEXT BRACKET — the ONE column every `kind:"tabs"` CONTEXT pane renders (D150).
//
// THE COLUMN, top to bottom: HEADER ROW (flex-none, on the shared chrome-row horizon: the pane's ONE tab strip,
// the view-level actions, and the close ×) → BAND (flex-none, optional: the artifact's identity — a character's
// portrait, the rpg Waystone; absent for a chat room, whose identity lives in the center header) → STATE RAIL
// (flex-none, a game room's `strip:"game"` cells, panel content — not a second tab strip) → VIEWPORT.
// The owner moved the tab strip from the foot to the header: there is no foot rail and no kicker.
//
// The bracket paints a 2px ember edge on the root (the content-to-context binding, from the theme's own
// primary token; colour is a theme token, shell.css is geometry), and the header row is that much shorter than
// the chrome row so its bottom divider lands on the same line as the topbar and list band.
//
// WHAT IT DOES NOT DO: no panel mechanics (width/mode/close/scrim stay `PanelChrome`'s, D62), no second
// selection store (`view.selectTab` writes the shared `contextTab`), no re-resolution (it renders the handed
// `node`s and never calls `body`/`when` itself).

import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Tabs, TabsPanel } from "@orb/ui/tabs";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { ContextRegionView } from "#lib";
import { GAME_STRIP_LABEL } from "#lib";
import { cellDomId } from "../lib/context-cell-id.ts";
import { ContextHeaderTabs, ContextRail } from "./context-rail.tsx";

export interface ContextBracketProps {
  /** The resolved tabs + the ONE selection seam + the host's view-level actions. */
  readonly view: ContextRegionView;
  /** The optional identity band under the header row — the section's `header` or a claiming region's band. */
  readonly band?: ReactNode;
  readonly empty?: ReactNode;
  /** The tab strip's accessible name: the artifact noun the pane is about ("Chat", "Character"). */
  readonly railLabel: string;
  /** The pane's own name, printed when a single tab leaves no strip. Absent ⇒ the rail label. */
  readonly paneLabel?: string;
  /** The pane's own way out, rendered as the header row's trailing ×. */
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
}

export function ContextBracket({ view, band, empty, railLabel, paneLabel, dismissLabel, onDismiss }: ContextBracketProps): ReactElement {
  const gameTabs = view.tabs.filter((tab) => tab.strip === "game");
  const metaTabs = view.tabs.filter((tab) => tab.strip === "meta");
  const active = view.tabs.find((tab) => tab.id === view.activeTab) ?? null;
  const activeStrip = active?.strip ?? null;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tabKey = view.tabs.map((tab) => tab.id).join(",");
  /** The selection this bracket last scrolled for — `undefined` until the first commit. */
  const seenTab = useRef<string | null | undefined>(undefined);
  // #908 — DEFER INACTIVE TAB SUBTREES. Only mount a tab's body when it has been selected at least once.
  // The initial active tab mounts immediately; every other tab defers its tree until first visit. Once
  // mounted, a tab stays mounted (Base UI's `inert` hides it) so a revisit is free. The set grows
  // monotonically: `visited` includes the active tab by construction, and clearing it would re-mount a
  // tab's queries from scratch.
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set(view.activeTab === null ? [] : [view.activeTab]));
  // Grow the set on each selection change. The derived-state-in-render form (React-sanctioned setState
  // during render) fires in the same commit the selection changes, so the panel's children are present
  // before Base UI removes `inert`.
  if (view.activeTab !== null && !visited.has(view.activeTab)) {
    setVisited((prev) => new Set([...prev, view.activeTab as string]));
  }

  // Keep the active cell fully in view when the SELECTION CHANGES — a programmatic change most of all (the
  // band's roster chip picking Members, a deep link), where nothing else scrolls an overflowing rail to the
  // cell it just chose. Roving focus native-scrolls the focused cell and a click lands on a visible one, so
  // those paths cost nothing here. `nearest` scrolls the minimum (a no-op when fully visible).
  //
  // NEVER AT MOUNT (measured 2026-08-30, #860): `scrollIntoView` moves Chromium's sequential-focus
  // navigation STARTING POINT to the element it scrolled, so a mount-time call on the active cell made the
  // very first Tab press land PAST the state rail — inside the viewport's body — with every cell still
  // `tabindex="0"`-correct and programmatically focusable (the #112 one-tab-stop CT caught it). Guarded
  // by comparing against the last selection seen rather than a first-run flag, so a strict-mode double
  // effect in dev cannot consume the guard and scroll at mount anyway.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeTab + tabKey are the intentional re-run triggers (selection change / tab-set change); the body reads the resolved active cell from the DOM, so neither appears in it.
  useEffect(() => {
    const previous = seenTab.current;
    seenTab.current = view.activeTab;
    if (previous === undefined || previous === view.activeTab) {
      return;
    }
    const activeEl = rootRef.current?.querySelector<HTMLElement>('[data-slot="tabs-tab"][data-active]');
    activeEl?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [view.activeTab, tabKey]);

  const hasBand = band !== undefined && band !== null;
  const hasDismiss = onDismiss !== undefined;
  return (
    <Tabs
      ref={rootRef}
      value={view.activeTab}
      onValueChange={(value): void => {
        if (typeof value === "string") {
          view.selectTab(value);
        }
      }}
      data-context-bracket={true}
      data-slot="context-bracket"
      // THE COLUMN HAS NO SEAM OF ITS OWN: each slot pays its own padding — `gap-0` overrides the tabs
      // primitive's own `gap-block` base, which #146 made a deterministic merge.
      className="flex h-full min-h-0 flex-col gap-0 border-t-2 border-primary/55"
    >
      <Row data-slot="context-bracket-header" align="center" className="shell-context-header shrink-0">
        <ContextHeaderTabs ariaLabel={railLabel} paneLabel={paneLabel} tabs={metaTabs} activeTab={view.activeTab} />
        {view.actions === undefined ? null : (
          <Row align="center" className="shrink-0 pe-field">
            {view.actions}
          </Row>
        )}
        {hasDismiss ? (
          <Button
            aria-label={dismissLabel ?? "Close panel"}
            data-slot="context-bracket-dismiss"
            intent="ghost"
            onClick={onDismiss}
            size="icon"
            type="button"
            className="me-field shrink-0"
          >
            <Icon icon={X} size="sm" />
          </Button>
        ) : null}
      </Row>
      {hasBand ? (
        <Stack data-slot="context-bracket-band" gap="row" className="relative shrink-0 px-block py-row">
          {band}
        </Stack>
      ) : null}
      {gameTabs.length > 0 ? (
        <ContextRail ariaLabel={GAME_STRIP_LABEL} tabs={gameTabs} activeTab={view.activeTab} owns={activeStrip === "game"} onSelect={view.selectTab} />
      ) : null}
      {/* One viewport, ALL tabs — a meta body opens in the same scroll region as a state body (owner decision 4);
          nothing about a body changes when the bracket draws the frame around it. The padding is the bracket's
          own now (the shell's panel-body padding is dropped under it), so a body keeps its breathing room while
          the chrome around it reaches the pane's edges. */}
      {/* #908 — only mount a tab's subtree once it has been selected at least once. The TabsPanel
          shell is always rendered (Base UI needs it for its `inert`/`hidden` bookkeeping), but its
          CHILDREN are deferred until first visit, cutting the initial commit-phase cost from 169-214ms
          to only the active tab's tree. */}
      {view.tabs.length === 0 ? (
        <Stack className="relative min-h-0 overflow-y-auto overscroll-contain" padding="row">
          {empty}
        </Stack>
      ) : null}
      {view.tabs.map((tab) => (
        <TabsPanel
          key={tab.id}
          value={tab.id}
          // `region`, not the primitive's `tabpanel`: Base UI offloads an inactive `tabpanel`'s children, and this
          // bracket keeps a visited panel mounted so a revisit is free (see the ARIA-model note in context-rail.tsx).
          role="region"
          // The tab names its panel; with one meta tab there is no strip to name it, so the panel names itself.
          {...(tab.strip === "meta" && metaTabs.length <= 1 ? { "aria-label": tab.label } : { "aria-labelledby": cellDomId(tab.id) })}
          className={`relative min-h-0 flex-initial overflow-y-auto overscroll-contain px-row py-row ${tab.opaque ? "bg-sidebar" : ""}`}
        >
          {visited.has(tab.id) ? tab.node : null}
        </TabsPanel>
      ))}
    </Tabs>
  );
}
