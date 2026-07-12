// ContextTabsPanel — the generic renderer for the CONTEXT_SLOTS registry (UI-Arch §4.1). Domain-agnostic
// (the ModalHost precedent): it reads the active section's tab strip from `CONTEXT_SLOTS`, pairs each
// entry's `id` with a ROUTE-injected body ReactNode (`bodies`), and renders the Base UI Tabs — plus an
// optional persistent `actions` menu ABOVE the strip (FINAL-Character §7 Actions). It knows nothing about
// Character/Chat — only sections, tab ids, and ReactNode slots, so a new domain grafts a context tab by
// adding a `CONTEXT_SLOTS` entry + wiring its body at the route, never editing the shell.
//
// The tab selection rides the SHARED `#state` `contextTab` seam (the chat panel uses the same seam — only
// one section's context ever mounts, so a stale value from another section simply falls back to the first
// tab). A jump-link elsewhere (e.g. the character hero's accent swatch → Appearance) writes the seam and
// this panel follows. Resolve against the VISIBLE ids so a foreign/absent value can't select nothing.

import { Row } from "@orb/ui/layout";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { SectionId } from "#state";
import { setContextTab, useContextTab } from "#state";
import { CONTEXT_SLOTS } from "../lib/context-slots";

export interface ContextTabsPanelProps {
  /** Which section's tab strip to render (`CONTEXT_SLOTS[section]`). */
  readonly section: SectionId;
  /** The route-injected tab bodies, keyed by `ContextTabEntry.id`. A registered tab with no body here
   *  renders an honest empty note (a wiring drift, never a crash). */
  readonly bodies: Readonly<Record<string, ReactNode>>;
  /** The persistent options menu rendered ABOVE the tab strip (secondary chrome; §7 Actions). */
  readonly actions?: ReactNode;
}

/** Render a section's registered CONTEXT tabs + its optional Actions menu, controlled by the shared
 *  `contextTab` seam. Empty registry ⇒ nothing (the shell shows its own placeholder upstream). */
export function ContextTabsPanel({
  section,
  bodies,
  actions,
}: ContextTabsPanelProps): ReactElement | null {
  const entries = CONTEXT_SLOTS[section] ?? [];
  const contextTab = useContextTab();
  if (entries.length === 0) {
    return null;
  }
  const visible = new Set(entries.map((entry) => entry.id));
  const first = entries[0]?.id ?? null;
  const activeTab = contextTab !== null && visible.has(contextTab) ? contextTab : first;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value): void => setContextTab(typeof value === "string" ? value : null)}
      className="flex h-full min-h-0 flex-col gap-row"
    >
      {/* The tab strip + the optional Actions menu share ONE row — tabs LEFT (scrollable), actions RIGHT
          (secondary chrome) — instead of the old orphaned menu floating in its own row above (owner: read
          as a hovering orphan). `shrink-0` keeps the row off the panel body below. When `actions` is
          undefined (most sections) the strip simply owns the full width. */}
      <Row align="center" gap="row" className="min-w-0 shrink-0">
        {/* The strip FILLS the panel width with EQUAL-WIDTH tabs (`w-full` list + `flex-1` per tab) so the
            3 tabs distribute across the ~22vw panel with no trailing dead gap (owner: ~77px orphan gap at
            the default width). `overflow-x-auto` stays the FALLBACK: `flex-1`'s default `min-width:auto`
            floors each tab at its label's intrinsic width, so once enough tabs are registered to exceed the
            panel the strip SCROLLS rather than crushing a tab below a legible/tap-safe width (side-eye P0 #2
            — "History"/"Activity" must never become invisible/un-clickable). `min-w-0 flex-1` on the list
            lets it take the row width + scroll without shoving the actions off the right edge. */}
        <TabsList aria-label="Detail" className="min-w-0 w-full flex-1 overflow-x-auto">
          {entries.map((entry) => (
            <TabsTab key={entry.id} value={entry.id} className="flex-1">
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
          {bodies[entry.id] ?? <Text tone="muted">Nothing to show here.</Text>}
        </TabsPanel>
      ))}
    </Tabs>
  );
}
