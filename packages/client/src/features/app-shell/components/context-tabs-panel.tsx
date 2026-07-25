// ContextTabsPanel — the generic renderer for a resolved `tabs` ContextDefinition (client-architecture-
// lockdown.md §6b). Domain-agnostic: it renders whatever already-resolved tab strip it's handed (each
// tab's `node` is pre-rendered by the host's `useResolved` hook) plus an optional persistent actions menu
// above the strip. A new domain grafts a context tab inside its OWN section definition, never here.
//
// Tab selection rides the shared #state contextTab seam; resolved against the visible ids so a
// foreign/absent value falls back to the first tab instead of selecting nothing.
//
// CONTAINER-RESPONSIVE labels (Context-Panel-Program CP-1 · UI-Arch §4.3 rule-4 · §4b axis-1): each tab
// renders its icon + a word label; the label COLLAPSES to icon-only (icon+tooltip) when the strip's
// @container can't fit every current tab's words (the fit logic + per-count thresholds live in shell.css
// `.ctx-tab-strip`, NOT a viewport @media and NOT a JS px). The label is ALWAYS the accessible name — a
// compressed tab is icon + `title` + `aria-label`, never nameless (Jordan/§9 icon-name ban); the visible
// word is what disappears, not the name. The CP-4 OSRS icon strips ARE this compressed form. A tab with
// no icon can't compress (data-has-icon absent), so its word stays put — never a nameless tab.

import { Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { ResolvedContextTab } from "#lib";
import { setContextTab, useContextTab } from "#state";

export interface ContextTabsPanelProps {
  readonly tabs: readonly ResolvedContextTab[];
  /** The persistent options menu rendered above the tab strip. */
  readonly actions?: ReactNode;
}

export function ContextTabsPanel({ tabs: entries, actions }: ContextTabsPanelProps): ReactElement | null {
  const contextTab = useContextTab();
  const listRef = useRef<HTMLDivElement | null>(null);
  const tabKey = entries.map((entry) => entry.id).join(",");

  // Keep the active tab fully in view on BOTH activation paths. Roving focus (arrow keys) native-scrolls
  // the focused tab; a click does not — so without this, click- and keyboard-activation leave DIFFERENT
  // neighbors clipped when a wide-host label-mode strip does overflow. Runs after Base UI has moved
  // `data-active` onto the selected tab; `nearest` scrolls the minimum (a no-op when fully visible).
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

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value): void => setContextTab(typeof value === "string" ? value : null)}
      className="flex h-full min-h-0 flex-col gap-row"
    >
      <Row align="center" gap="row" className="min-w-0 shrink-0">
        {/* `.ctx-tab-strip` = the @container; `data-tab-count` picks the per-count label-reveal threshold
            (shell.css). `overflow-x-auto` is the safety scroll if a wide host shows words that still don't
            fit — icon-mode always fits, so this only ever bites in label-mode. */}
        <TabsList ref={listRef} aria-label="Detail" data-tab-count={entries.length} className="ctx-tab-strip min-w-0 w-full gap-field overflow-x-auto">
          {entries.map((entry) => (
            <ContextTab key={entry.id} entry={entry} />
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

/** One tab: icon (when the def carries one) + the word label. The label is the accessible name in BOTH
 *  forms — `aria-label` carries it always, so when shell.css collapses `.ctx-tab-label` in icon-mode the
 *  tab is still named. An icon-mode tab is icon + `title` (the hover name reveal) + `aria-label` (never
 *  nameless — Jordan/§9). An icon-less tab keeps its visible word unconditionally (no `data-has-icon`),
 *  so it needs neither `title` nor `data-has-icon`. */
function ContextTab({ entry }: { readonly entry: ResolvedContextTab }): ReactElement {
  const hasIcon = entry.icon !== undefined;
  return (
    <TabsTab
      value={entry.id}
      aria-label={entry.label}
      className="shrink-0 flex items-center justify-center gap-field px-field"
      {...(hasIcon ? { "data-has-icon": true, title: entry.label } : {})}
    >
      {entry.icon !== undefined ? <Icon icon={entry.icon} size="sm" /> : null}
      <span className="ctx-tab-label">{entry.label}</span>
    </TabsTab>
  );
}
