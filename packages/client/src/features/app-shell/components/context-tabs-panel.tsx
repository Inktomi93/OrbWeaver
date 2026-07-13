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
import type { SectionId } from "#state";
import { setContextTab, useContextTab } from "#state";
import { CONTEXT_SLOTS } from "../lib/context-slots";

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
      <Row align="center" gap="row" className="min-w-0 shrink-0">
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
