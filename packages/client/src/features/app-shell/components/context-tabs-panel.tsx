// ContextTabsPanel — the generic renderer for the CONTEXT_SLOTS registry. Domain-agnostic: it reads the
// active section's tab strip, pairs each entry's id with a route-injected body, and renders the Base UI
// Tabs plus an optional persistent actions menu above the strip. A new domain grafts a context tab by
// adding a CONTEXT_SLOTS entry and wiring its body at the route, never editing the shell.
//
// Tab selection rides the shared #state contextTab seam; resolved against the visible ids so a
// foreign/absent value falls back to the first tab instead of selecting nothing.

import { Row } from "@orb/ui/layout";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { SectionId } from "#state";
import { setContextTab, useContextTab } from "#state";
import { CONTEXT_SLOTS } from "../lib/context-slots";

/** Above this tab count the CONTEXT strip can't fit at every panel width, so it scrolls with a fade
 *  cue instead of stretching each tab to fill. */
const MAX_STRETCH_TABS = 4;

export interface ContextTabsPanelProps {
  readonly section: SectionId;
  /** The route-injected tab bodies, keyed by ContextTabEntry.id. A registered tab with no body here renders an honest empty note. */
  readonly bodies: Readonly<Record<string, ReactNode>>;
  /** The persistent options menu rendered above the tab strip. */
  readonly actions?: ReactNode;
}

export function ContextTabsPanel({
  section,
  bodies,
  actions,
}: ContextTabsPanelProps): ReactElement | null {
  const entries = CONTEXT_SLOTS[section] ?? [];
  const contextTab = useContextTab();
  // A few tabs stretch to fill the strip; a crowded strip (5+ in this narrow panel) can't fit at
  // every panel width, so it packs tabs at their natural width, tightens their padding, and scrolls.
  const stretch = entries.length <= MAX_STRETCH_TABS;
  // The trailing-edge fade cue rides only ACTUAL horizontal overflow (measured), so a strip that fits
  // never dims its last tab; it re-measures on panel resize + tab-set change.
  const listRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const tabKey = entries.map((entry) => entry.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: tabKey is the intentional re-measure trigger — a new tab SET changes the strip's content width with no resize event for the observer to catch.
  useEffect(() => {
    const el = listRef.current;
    if (el === null) {
      return;
    }
    const measure = (): void => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return (): void => observer.disconnect();
  }, [tabKey]);

  if (entries.length === 0) {
    return null;
  }
  const visible = new Set(entries.map((entry) => entry.id));
  const first = entries[0]?.id ?? null;
  const activeTab = contextTab !== null && visible.has(contextTab) ? contextTab : first;
  const listClassName = stretch
    ? "min-w-0 w-full overflow-x-auto"
    : `min-w-0 w-full overflow-x-auto gap-field${overflowing ? " scroll-fade-x" : ""}`;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value): void => setContextTab(typeof value === "string" ? value : null)}
      className="flex h-full min-h-0 flex-col gap-row"
    >
      <Row align="center" gap="row" className="min-w-0 shrink-0">
        <TabsList ref={listRef} aria-label="Detail" className={listClassName}>
          {entries.map((entry) => (
            <TabsTab
              key={entry.id}
              value={entry.id}
              className={stretch ? "flex-1" : "shrink-0 px-field"}
            >
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
