// ContextTabsPanel — the generic renderer for a resolved `tabs` ContextDefinition (client-architecture-
// lockdown.md §6b). Domain-agnostic: it renders whatever already-resolved tab strip it's handed (each
// tab's `node` is pre-rendered by the host's `useResolved` hook) plus an optional persistent actions menu
// above the strip. A new domain grafts a context tab inside its OWN section definition, never here.
//
// Tab selection rides the shared #state contextTab seam; resolved against the visible ids so a
// foreign/absent value falls back to the first tab instead of selecting nothing.

import { Row } from "@orb/ui/layout";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { ResolvedContextTab } from "#lib";
import { setContextTab, useContextTab } from "#state";

/** A soft ceiling for "usually fits" reasoning — the actual stretch/scroll switch is the MEASURED
 *  `overflowing` state below, since fit depends on live panel width, not tab count alone. */
const MAX_STRETCH_TABS = 4;

/** An edge fades / the strip counts as overflowing only past this many px — sub-pixel rounding must
 *  not flicker the fade on a strip that actually fits. */
const EDGE_FADE_EPSILON_PX = 1;

export interface ContextTabsPanelProps {
  readonly tabs: readonly ResolvedContextTab[];
  /** The persistent options menu rendered above the tab strip. */
  readonly actions?: ReactNode;
}

export function ContextTabsPanel({ tabs: entries, actions }: ContextTabsPanelProps): ReactElement | null {
  const contextTab = useContextTab();
  // A few tabs stretch to fill the strip; a crowded strip (5+ in this narrow panel) can't fit at
  // every panel width, so it packs tabs at their natural width, tightens their padding, and scrolls.
  const stretch = entries.length <= MAX_STRETCH_TABS;
  // Overflow drives the stretch/scroll switch; the edge fades ride the live SCROLL POSITION (not just
  // "overflows somewhere") so whichever edge has clipped content behind it dissolves — the same
  // scroll-aware, both-edge mechanism as the vertical `message-list-scroll` fade. Re-measures on panel
  // resize, tab-set change, and every scroll.
  const listRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const tabKey = entries.map((entry) => entry.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: tabKey is the intentional re-measure trigger — a new tab SET changes the strip's content width with no resize event for the observer to catch.
  useEffect(() => {
    const el = listRef.current;
    if (el === null) {
      return;
    }
    const measure = (): void => {
      setOverflowing(el.scrollWidth > el.clientWidth + EDGE_FADE_EPSILON_PX);
      el.toggleAttribute("data-fade-start", el.scrollLeft > EDGE_FADE_EPSILON_PX);
      el.toggleAttribute("data-fade-end", el.scrollWidth - el.scrollLeft - el.clientWidth > EDGE_FADE_EPSILON_PX);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return (): void => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [tabKey]);

  // Keep the active tab fully in view on BOTH activation paths. Roving focus (arrow keys) native-scrolls
  // the focused tab; a click does not — so without this, click- and keyboard-activation leave DIFFERENT
  // neighbors clipped. Runs after Base UI has moved `data-active` onto the selected tab; `nearest` scrolls
  // the minimum (a no-op when the tab is already fully visible) and never nudges the block axis.
  // biome-ignore lint/correctness/useExhaustiveDependencies: contextTab + tabKey are the intentional re-run triggers (selection change / tab-set change); the body reads the resolved active tab from the DOM, so neither appears in it.
  useEffect(() => {
    const activeEl = listRef.current?.querySelector<HTMLElement>('[data-slot="tabs-tab"][data-active]');
    activeEl?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [contextTab, tabKey]);

  if (entries.length === 0) {
    return null;
  }
  const visible = new Set(entries.map((entry) => entry.id));
  const first = entries[0]?.id ?? null;
  const activeTab = contextTab !== null && visible.has(contextTab) ? contextTab : first;
  // Fit is the MEASURED state, not the static tab count: a strip that actually overflows must scroll
  // (with the fade cue) and its tabs must NOT be flex-1-forced, regardless of how few tabs it holds.
  const fits = stretch && !overflowing;
  const listClassName = fits ? "min-w-0 w-full overflow-x-auto" : "min-w-0 w-full overflow-x-auto gap-field scroll-fade-x";

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value): void => setContextTab(typeof value === "string" ? value : null)}
      className="flex h-full min-h-0 flex-col gap-row"
    >
      <Row align="center" gap="row" className="min-w-0 shrink-0">
        <TabsList ref={listRef} aria-label="Detail" className={listClassName}>
          {entries.map((entry) => (
            <TabsTab key={entry.id} value={entry.id} className={fits ? "flex-1" : "shrink-0 px-field"}>
              {entry.label}
            </TabsTab>
          ))}
          <TabsIndicator />
        </TabsList>
        {actions !== undefined ? (
          <Row align="center" className="shrink-0">
            {actions}
          </Row>
        ) : null}
      </Row>
      {entries.map((entry) => (
        <TabsPanel key={entry.id} value={entry.id}>
          {entry.node}
        </TabsPanel>
      ))}
    </Tabs>
  );
}
