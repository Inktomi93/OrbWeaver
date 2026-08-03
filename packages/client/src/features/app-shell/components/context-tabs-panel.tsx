// ContextTabsPanel — the generic renderer for a resolved `tabs` ContextDefinition (client-architecture-
// lockdown.md §6b). Domain-agnostic: it renders whatever already-resolved tab strip it's handed (each
// tab's `node` is pre-rendered by the host's `useResolved` hook) plus an optional persistent actions menu
// above the strip. A new domain grafts a context tab inside its OWN section definition, never here.
//
// Tab selection rides the shared #state contextTab seam; resolved against the visible ids so a
// foreign/absent value falls back to a tab instead of selecting nothing — a `defaultTab`-flagged tab
// (rpg.status for a game chat, §4.1) if one is present, else the first visible tab.
//
// ONE STRIP, ALWAYS (HUD-1 §5.1). The two-strip BRACKET branch is DELETED: a bracket is a HUD's own
// arrangement, and a HUD now CLAIMS the whole pane (`ContextRegionHost`) instead of renting slots here. This
// panel is what an UNCLAIMED pane renders — the six generic sections and every non-game chat — so it carries
// every visible tab in a single top strip labelled "Detail", the pre-HUD contract, now permanent. Tab
// `strip` (rail membership) is a CLAIMANT's vocabulary; this renderer ignores it.
//
// CONTAINER-RESPONSIVE labels (Context-Panel-Program CP-1 · UI-Arch §4.3 rule-4 · §4b axis-1): each tab
// renders its icon + a word label; the label COLLAPSES to icon-only (icon+tooltip) when the strip's
// @container can't fit every current tab's words (the fit logic + per-count thresholds live in shell.css
// `.ctx-tab-strip`, NOT a viewport @media and NOT a JS px). The label is ALWAYS the accessible name — a
// compressed tab is icon + `title` + `aria-label`, never nameless (Jordan/§9 icon-name ban); the visible
// word is what disappears, not the name. The CP-4 OSRS icon strips ARE this compressed form. A tab with
// no icon can't compress (data-has-icon absent), so its word stays put — never a nameless tab.

import { Badge } from "@orb/ui/badge";
import { Icon, Lock } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { ResolvedContextTab } from "#lib";
import { useContextTabSelection } from "../hooks/use-context-tab-selection.ts";

export interface ContextTabsPanelProps {
  readonly tabs: readonly ResolvedContextTab[];
  /** The persistent options menu rendered above the tab strip. */
  readonly actions?: ReactNode;
}

export function ContextTabsPanel({ tabs: entries, actions }: ContextTabsPanelProps): ReactElement | null {
  // The ONE selection resolver, shared with `ContextRegionHost` (HUD-1 §3.4) — stored → `defaultTab` →
  // declared-first, so the two pane compositions cannot drift.
  const { activeTab, selectTab } = useContextTabSelection(entries);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tabKey = entries.map((entry) => entry.id).join(",");

  // Keep the active tab fully in view on BOTH activation paths. Roving focus (arrow keys) native-scrolls
  // the focused tab; a click does not — so without this, click- and keyboard-activation leave DIFFERENT
  // neighbors clipped when a wide-host label-mode strip does overflow. Runs after Base UI has moved
  // `data-active` onto the selected tab; `nearest` scrolls the minimum (a no-op when fully visible).
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeTab + tabKey are the intentional re-run triggers (selection change / tab-set change); the body reads the resolved active tab from the DOM, so neither appears in it.
  useEffect(() => {
    const activeEl = rootRef.current?.querySelector<HTMLElement>('[data-slot="tabs-tab"][data-active]');
    activeEl?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeTab, tabKey]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <Tabs
      ref={rootRef}
      value={activeTab}
      onValueChange={(value): void => {
        if (typeof value === "string") {
          selectTab(value);
        }
      }}
      className="flex h-full min-h-0 flex-col gap-row"
    >
      <ContextTabStrip ariaLabel="Detail" tabs={entries} activeTab={activeTab} actions={actions} />
      {/* THE VIEWPORT SCROLLS INTERNALLY: the strip is `shrink-0`, the active panel is
          `flex-1 min-h-0 overflow-y-auto`, so a tall body scrolls in place rather than via the shell body.
          Base UI hides the inactive panels (display:none), so exactly one ever takes the flex space. */}
      {entries.map((entry) => (
        <TabsPanel key={entry.id} value={entry.id} className="min-h-0 flex-1 overflow-y-auto">
          {entry.node}
        </TabsPanel>
      ))}
    </Tabs>
  );
}

interface ContextTabStripProps {
  readonly ariaLabel: string;
  readonly tabs: readonly ResolvedContextTab[];
  readonly activeTab: string | null;
  readonly actions?: ReactNode;
}

/** The ONE `.ctx-tab-strip` TabsList (its own a11y group + roving-focus row) with its `data-tab-count`
 *  reveal threshold.
 *
 *  The active marker is a PER-TAB 2px bar on the strip's INWARD (bottom) edge — transparent on every tab,
 *  `--color-primary` on the active one, so selection costs zero layout shift — plus the ember active tint,
 *  NOT the sliding `TabsIndicator` (which sat in the list's `overflow-x-auto` scroll container where it
 *  could clip invisible). */
function ContextTabStrip({ ariaLabel, tabs, activeTab, actions }: ContextTabStripProps): ReactElement {
  return (
    <Row align="center" gap="row" className="min-w-0 shrink-0">
      {/* `.ctx-tab-strip` = the @container; `data-tab-count` picks the per-count label-reveal threshold
          (shell.css). `overflow-x-auto` is the safety scroll if a wide host shows words that still don't
          fit — icon-mode always fits, so this only ever bites in label-mode. */}
      <TabsList aria-label={ariaLabel} data-tab-count={tabs.length} className="ctx-tab-strip min-w-0 w-full gap-field overflow-x-auto">
        {tabs.map((entry) => (
          <ContextTab key={entry.id} entry={entry} isActive={entry.id === activeTab} />
        ))}
      </TabsList>
      {actions !== undefined ? (
        <Row align="center" className="shrink-0">
          {actions}
        </Row>
      ) : null}
    </Row>
  );
}

/** The tab's inward-facing 2px active bar (transparent at rest — no layout shift on selection) + the ember
 *  active state (tint + primary icon/label — the mock's `.tabbtn.active`). */
const TAB_ACTIVE_CLASSES = "border-b-2 border-transparent data-active:border-primary data-active:bg-primary/10 data-active:text-primary";

/** One tab: icon (when the def carries one) + the word label, plus the §4.6 state affordances. The label
 *  is the accessible name in BOTH forms — `aria-label` carries it always, so when shell.css collapses
 *  `.ctx-tab-label` in icon-mode the tab is still named. An icon-mode tab is icon + `title` (the hover name
 *  reveal) + `aria-label`. An icon-less tab keeps its visible word unconditionally (no `data-has-icon`).
 *
 *  Badge (§4.6): a dot when `badge` is truthy-boolean, a count when it's a number \> 0 — NEVER on the active
 *  tab, and the dot is `aria-hidden` (the tab content states the change). Disabled (PHASE, §4.6): a non-null
 *  `disabledReason` ⇒ `aria-disabled` + `title=<reason>` (the [base-ui-disabled-menuitem-title] pattern —
 *  never a tooltip wrap) + reduced opacity + a lock glyph, staying focusable-discoverable. */
function ContextTab({ entry, isActive }: { readonly entry: ResolvedContextTab; readonly isActive: boolean }): ReactElement {
  const hasIcon = entry.icon !== undefined;
  const disabled = entry.disabledReason !== null;
  // The disabled reason owns `title`; otherwise an icon-mode tab uses `title` for the hover name reveal.
  const title = entry.disabledReason ?? (hasIcon ? entry.label : undefined);

  return (
    <TabsTab
      value={entry.id}
      aria-label={entry.label}
      className={`relative shrink-0 flex items-center justify-center gap-field px-field aria-disabled:opacity-50 ${TAB_ACTIVE_CLASSES}`}
      {...(hasIcon ? { "data-has-icon": true } : {})}
      {...(title !== undefined ? { title } : {})}
      {...(disabled ? { "aria-disabled": true } : {})}
    >
      {entry.icon !== undefined ? <Icon icon={entry.icon} size="sm" /> : null}
      <span className="ctx-tab-label">{entry.label}</span>
      {disabled ? <Icon icon={Lock} size="xs" aria-hidden={true} className="text-muted-foreground" /> : null}
      {disabled ? null : <TabBadge badge={entry.badge} isActive={isActive} />}
    </TabsTab>
  );
}

/** The §4.6 change badge: a `<Badge>` count for a number \> 0, a 6px corner dot for a truthy boolean, and
 *  NOTHING on the active tab (or for a falsy `badge`). The dot is `aria-hidden` — the tab content states
 *  the change, so the badge is supplementary only (§4.9). */
function TabBadge({ badge, isActive }: { readonly badge: number | boolean | null; readonly isActive: boolean }): ReactElement | null {
  if (isActive) {
    return null;
  }
  const count = typeof badge === "number" ? badge : 0;
  if (count > 0) {
    return (
      <Badge intent="primary" size="sm" aria-hidden={true}>
        {count}
      </Badge>
    );
  }
  if (badge === true) {
    return <span aria-hidden={true} className="absolute right-0 top-0 size-1.5 rounded-full bg-primary" />;
  }
  return null;
}
