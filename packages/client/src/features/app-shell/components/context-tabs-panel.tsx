// ContextTabsPanel — the generic renderer for a resolved `tabs` ContextDefinition (client-architecture-
// lockdown.md §6b). Domain-agnostic: it renders whatever already-resolved tab strip it's handed (each
// tab's `node` is pre-rendered by the host's `useResolved` hook) plus an optional persistent actions menu
// above the strip. A new domain grafts a context tab inside its OWN section definition, never here.
//
// Tab selection rides the shared #state contextTab seam; resolved against the visible ids so a
// foreign/absent value falls back to a tab instead of selecting nothing — a `defaultTab`-flagged tab
// (rpg.status for a game chat, §4.1) if one is present, else the first visible tab.
//
// THE BRACKET (Context-Panel-Program §4.2, CP-4): when ≥1 resolved tab is `strip:"game"`, the panel splits
// into TWO strips inside ONE `Tabs` root — a GAME TabsList ABOVE the viewport (state), a META TabsList
// BELOW it (administration). It is ONE selection: a tab in EITHER strip can be active, the viewport shows
// its panel, and selecting in one strip deselects the other (Base UI resolves this natively — two
// `Tabs.List`s under one root share the root `value`, each its own roving-focus group). When NO tab is
// `strip:"game"` (every standard section — all tabs default `"meta"`) the panel renders EXACTLY as before:
// one top strip, one TabsList, no bracket, zero layout shift (§4.2 backward-compat floor).
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
import { setContextTab, useContextTab } from "#state";

export interface ContextTabsPanelProps {
  readonly tabs: readonly ResolvedContextTab[];
  /** The persistent options menu rendered above the tab strip. */
  readonly actions?: ReactNode;
}

export function ContextTabsPanel({ tabs: entries, actions }: ContextTabsPanelProps): ReactElement | null {
  const contextTab = useContextTab();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tabKey = entries.map((entry) => entry.id).join(",");

  // Keep the active tab fully in view on BOTH activation paths. Roving focus (arrow keys) native-scrolls
  // the focused tab; a click does not — so without this, click- and keyboard-activation leave DIFFERENT
  // neighbors clipped when a wide-host label-mode strip does overflow. Runs after Base UI has moved
  // `data-active` onto the selected tab; `nearest` scrolls the minimum (a no-op when fully visible). The
  // query spans the whole Tabs root, so it finds the active tab in EITHER strip of the bracket.
  // biome-ignore lint/correctness/useExhaustiveDependencies: contextTab + tabKey are the intentional re-run triggers (selection change / tab-set change); the body reads the resolved active tab from the DOM, so neither appears in it.
  useEffect(() => {
    const activeEl = rootRef.current?.querySelector<HTMLElement>('[data-slot="tabs-tab"][data-active]');
    activeEl?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [contextTab, tabKey]);

  if (entries.length === 0) {
    return null;
  }
  const gameTabs = entries.filter((entry) => entry.strip === "game");
  const metaTabs = entries.filter((entry) => entry.strip === "meta");
  const hasBracket = gameTabs.length > 0;

  const visible = new Set(entries.map((entry) => entry.id));
  // Fallback default (Context-Panel-Program §4.1): a tab that flags `defaultTab` (rpg.status for a game
  // chat) wins the empty/foreign-selection landing over the declared-order first — so a game chat lands on
  // Status, not the roster's Members. A stored, still-visible `contextTab` always wins first (continuity).
  const first = (entries.find((entry) => entry.defaultTab) ?? entries[0])?.id ?? null;
  const activeTab = contextTab !== null && visible.has(contextTab) ? contextTab : first;

  return (
    <Tabs
      ref={rootRef}
      value={activeTab}
      onValueChange={(value): void => setContextTab(typeof value === "string" ? value : null)}
      className="flex h-full min-h-0 flex-col gap-row"
    >
      {/* No bracket ⇒ the single top strip carries every (meta) tab, aria-label "Detail" — byte-identical
          to the pre-bracket panel. With a bracket ⇒ the GAME strip ("Game") sits above the viewport. */}
      <ContextTabStrip ariaLabel={hasBracket ? "Game" : "Detail"} tabs={hasBracket ? gameTabs : metaTabs} activeTab={activeTab} actions={actions} edge="top" />
      {/* THE VIEWPORT SCROLLS INTERNALLY (Context-Panel-Program §4.2 "VIEWPORT scrolls internally"): the two
          strips are `shrink-0`, the active panel is `flex-1 min-h-0 overflow-y-auto`, so a tall body scrolls
          WITHIN the bracket and the bottom meta strip stays pinned/visible — never pushed off-screen. Base UI
          hides the inactive panels (display:none), so exactly one panel ever takes the flex space. This is the
          shared path (every section is a `Tabs` panel now scrolls in-place, not via the shell body); the
          single-strip case is identical — one strip, one scrolling panel, no bottom strip. */}
      {entries.map((entry) => (
        <TabsPanel key={entry.id} value={entry.id} className="min-h-0 flex-1 overflow-y-auto">
          {entry.node}
        </TabsPanel>
      ))}
      {hasBracket ? <ContextTabStrip ariaLabel="Chat" tabs={metaTabs} activeTab={activeTab} edge="bottom" /> : null}
    </Tabs>
  );
}

interface ContextTabStripProps {
  readonly ariaLabel: string;
  readonly tabs: readonly ResolvedContextTab[];
  readonly activeTab: string | null;
  readonly actions?: ReactNode;
  /** Which panel edge this strip sits on — the active indicator + the hairline face INWARD toward the
   *  content (the bracket rule): a `top` strip marks the active tab on its BOTTOM edge, a `bottom` strip
   *  on its TOP edge (the OSRS bracket / panel-redesign strips — `.strip.top`/`.strip.bottom`). */
  readonly edge: "top" | "bottom";
}

/** One `.ctx-tab-strip` TabsList (its OWN a11y group + roving-focus row) with its own `data-tab-count`
 *  reveal threshold. Rendered once for a single-strip panel, twice for the bracket (Game / Chat).
 *
 *  The active marker is a PER-TAB inward-facing 2px bar (transparent on every tab, `--color-primary` on
 *  the active one — zero layout shift) + the ember active tint, NOT the sliding `TabsIndicator`: the
 *  absolute-positioned indicator sat at the list's scroll-container bottom where the safety
 *  `overflow-x-auto` could clip it invisible on the top strip, and it can't flip edges per strip. The
 *  list's hairline track flips with the strip (top strip: border-b; bottom strip: border-t) so the rule
 *  always sits between strip and content, never dangling on the outside edge. */
function ContextTabStrip({ ariaLabel, tabs, activeTab, actions, edge }: ContextTabStripProps): ReactElement {
  return (
    <Row align="center" gap="row" className="min-w-0 shrink-0">
      {/* `.ctx-tab-strip` = the @container; `data-tab-count` picks the per-count label-reveal threshold
          (shell.css). `overflow-x-auto` is the safety scroll if a wide host shows words that still don't
          fit — icon-mode always fits, so this only ever bites in label-mode. */}
      <TabsList
        aria-label={ariaLabel}
        data-tab-count={tabs.length}
        className={`ctx-tab-strip min-w-0 w-full gap-field overflow-x-auto ${edge === "bottom" ? "border-b-0 border-t border-border" : ""}`}
      >
        {tabs.map((entry) => (
          <ContextTab key={entry.id} entry={entry} isActive={entry.id === activeTab} edge={edge} />
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

/** The per-edge tab classes: the inward-facing 2px active bar (transparent at rest — no layout shift on
 *  selection) + the ember active state (tint + primary icon/label — the mock's `.tabbtn.active`). */
const TAB_EDGE_CLASSES: Readonly<Record<"top" | "bottom", string>> = {
  top: "border-b-2 border-transparent data-active:border-primary data-active:bg-primary/10 data-active:text-primary",
  bottom: "border-t-2 border-transparent data-active:border-primary data-active:bg-primary/10 data-active:text-primary",
};

/** One tab: icon (when the def carries one) + the word label, plus the §4.6 state affordances. The label
 *  is the accessible name in BOTH forms — `aria-label` carries it always, so when shell.css collapses
 *  `.ctx-tab-label` in icon-mode the tab is still named. An icon-mode tab is icon + `title` (the hover name
 *  reveal) + `aria-label`. An icon-less tab keeps its visible word unconditionally (no `data-has-icon`).
 *
 *  Badge (§4.6): a dot when `badge` is truthy-boolean, a count when it's a number \> 0 — NEVER on the active
 *  tab, and the dot is `aria-hidden` (the tab content states the change). Disabled (PHASE, §4.6): a non-null
 *  `disabledReason` ⇒ `aria-disabled` + `title=<reason>` (the [base-ui-disabled-menuitem-title] pattern —
 *  never a tooltip wrap) + reduced opacity + a lock glyph, staying focusable-discoverable. */
function ContextTab({
  entry,
  isActive,
  edge,
}: {
  readonly entry: ResolvedContextTab;
  readonly isActive: boolean;
  readonly edge: "top" | "bottom";
}): ReactElement {
  const hasIcon = entry.icon !== undefined;
  const disabled = entry.disabledReason !== null;
  // The disabled reason owns `title`; otherwise an icon-mode tab uses `title` for the hover name reveal.
  const title = entry.disabledReason ?? (hasIcon ? entry.label : undefined);

  return (
    <TabsTab
      value={entry.id}
      aria-label={entry.label}
      className={`relative shrink-0 flex items-center justify-center gap-field px-field aria-disabled:opacity-50 ${TAB_EDGE_CLASSES[edge]}`}
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
