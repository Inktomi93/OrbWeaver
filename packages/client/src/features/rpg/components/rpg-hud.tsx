// The rpg HUD — the WHOLE CONTEXT pane on an engaged game chat (HUD-1 §3.1/§4/§7). The panel no longer
// rents chrome from the shell: this component owns the vertical composition end to end, which is what makes
// the F6 defects fixable at all (nobody owned it before — the band was the shell's, the strips were the
// shell's, the bodies were the feature's, and the arrangement was an accident of three specs).
//
// THE COLUMN, top to bottom: BAND (flex-none — the waystone, painting the 2px ember content↔context binding
// edge itself now that no `.shell-panel-header` sits above it) → GAME rail (flex-none, the state tabs) →
// VIEWPORT (`flex-initial` = `flex: 0 1 auto` + min-h-0 + scroll) → ADMIN rail (flex-none, the chat tabs).
//
// THE VIEWPORT IS `flex-initial`, NOT `flex-1` (§7.1 — the dead-zone rule, F6 defect 4): a SHORT body takes
// its natural height and the admin rail rides up directly beneath it; a TALL body shrinks the viewport to
// the space available, scrolls internally, and the rail stays pinned at the bottom exactly as before. The
// generic panel's `flex-1` law is right for a details pane that always fills; it is wrong for a HUD, and it
// is the line that produced the ~400px dead zone under a short scene.
//
// WHAT IT DOES NOT DO (§3.6 fences): no panel mechanics (width/mode/close/scrim stay the shell's, D62), no
// CSS (composed from `@orb/ui` primitives + token utilities — `.ctx-tab-strip` is the shell's and a gate arm
// makes reaching for it RED), no second selection store (`view.selectTab` writes the shared `contextTab`),
// no re-resolution (it renders the handed `node`s and never calls `body`/`when` itself).
//
// The tab CELL is the HUD's own: rail membership, the always-visible caption (§7.2 — the "compressed form is
// the only form" defect dies here), the active treatment and the PHASE-locked treatment are arrangement, and
// arrangement is exactly what forked. The resolution, selection, `when`-gating, badge and disabled VALUES all
// stay shared — they arrive already resolved.

import { Badge } from "@orb/ui/badge";
import { Icon, Lock } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryBoundary } from "#data";
import type { ContextRegionView, ResolvedContextTab } from "#lib";
import { useActiveChatId } from "#state";
import { RpgHeaderBand } from "./rpg-header-band";

export interface RpgHudProps {
  readonly view: ContextRegionView;
}

export function RpgHud({ view }: RpgHudProps): ReactElement {
  const gameTabs = view.tabs.filter((tab) => tab.strip === "game");
  const adminTabs = view.tabs.filter((tab) => tab.strip === "meta");
  return (
    <Tabs
      value={view.activeTab}
      onValueChange={(value): void => {
        if (typeof value === "string") {
          view.selectTab(value);
        }
      }}
      className="flex h-full min-h-0 flex-col gap-row"
    >
      <RpgHudBand />
      {gameTabs.length > 0 ? <RpgHudRail ariaLabel="Game" tabs={gameTabs} activeTab={view.activeTab} edge="top" /> : null}
      {/* One viewport, ALL tabs — an admin body opens in the same scroll region as a state body (owner
          decision 4); nothing about a body changes when the HUD draws the frame around it. */}
      {view.tabs.map((tab) => (
        <TabsPanel key={tab.id} value={tab.id} className="min-h-0 flex-initial overflow-y-auto">
          {tab.node}
        </TabsPanel>
      ))}
      {adminTabs.length > 0 ? <RpgHudRail ariaLabel="Chat" tabs={adminTabs} activeTab={view.activeTab} actions={view.actions} edge="bottom" /> : null}
    </Tabs>
  );
}

/** The HUD's own BAND — the waystone composite, plus the 2px ember top edge the shell's band used to paint
 *  (the content↔context binding survives; it just gets painted by its owner now, §5.1).
 *
 *  The chat id comes from `#state`'s active-chat pointer, not from the claimant's `S`: the region `render`
 *  deliberately receives only the shell view, so a claimant's domain state comes from its own hooks (§3.2).
 *  The claim only holds for a committed game chat, so the pointer is present whenever this renders.
 *
 *  The band is DECORATION over the same reads the tab bodies own: on error it collapses to nothing (its own
 *  boundary, `renderError → null`) so a failed read is the ONE announced surface in the body, never a second
 *  generic error block above it. */
function RpgHudBand(): ReactElement | null {
  const chatId = useActiveChatId();
  if (chatId === null) {
    return null;
  }
  return (
    <Stack gap="row" className="shrink-0 border-t-2 border-primary/55 px-block py-row">
      <QueryBoundary fallback={null} renderError={(): null => null}>
        <RpgHeaderBand chatId={chatId} />
      </QueryBoundary>
    </Stack>
  );
}

/** The rail's hairline track and its cells' active bar both face INWARD, toward the viewport between them:
 *  the GAME rail (above) marks its bottom edge, the ADMIN rail (below) its top. A marker on the outside
 *  edge dangles against the panel frame instead of binding the rail to the content it selects. */
const RAIL_EDGE_CLASSES: Readonly<Record<"top" | "bottom", string>> = {
  top: "border-b border-border",
  bottom: "border-b-0 border-t border-border",
};
const CELL_EDGE_CLASSES: Readonly<Record<"top" | "bottom", string>> = {
  top: "border-b-2 border-transparent data-active:border-primary",
  bottom: "border-t-2 border-transparent data-active:border-primary",
};

/** One rail: its OWN labelled a11y group + roving-focus row, cells as equal columns so the rail reads as a
 *  solid frame rather than bitsy buttons bunched left (the 2026-07-28 owner ruling, carried over). */
function RpgHudRail({
  ariaLabel,
  tabs,
  activeTab,
  actions,
  edge,
}: {
  readonly ariaLabel: string;
  readonly tabs: readonly ResolvedContextTab[];
  readonly activeTab: string | null;
  readonly actions?: ContextRegionView["actions"];
  readonly edge: "top" | "bottom";
}): ReactElement {
  return (
    <Row align="center" gap="row" className="min-w-0 shrink-0">
      <TabsList aria-label={ariaLabel} className={`grid min-w-0 w-full auto-cols-fr grid-flow-col gap-field ${RAIL_EDGE_CLASSES[edge]}`}>
        {tabs.map((tab) => (
          <RpgHudCell key={tab.id} tab={tab} isActive={tab.id === activeTab} edge={edge} />
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

/** One cell: glyph + caption, ALWAYS both (§7.2). The caption is the accessible name AND visible — the panel
 *  is never wide enough for the shared strip's container-query reveal to fire, so an icon-only game rail was
 *  permanent, not "compressed" (F6 defect 2). At the 17rem floor the caption truncates and `title` carries
 *  the full name; a nameless glyph is never a state this can reach.
 *
 *  PHASE-locked (the Map): `aria-disabled` + the reason on `title` + a lock glyph, staying keyboard-reachable
 *  — never `disabled`. Badge: a count for a number \> 0, a dot for a truthy boolean, and NOTHING on the
 *  active tab; both `aria-hidden`, since the body states the change. */
function RpgHudCell({ tab, isActive, edge }: { readonly tab: ResolvedContextTab; readonly isActive: boolean; readonly edge: "top" | "bottom" }): ReactElement {
  const disabled = tab.disabledReason !== null;
  const count = typeof tab.badge === "number" ? tab.badge : 0;
  return (
    <TabsTab
      value={tab.id}
      aria-label={tab.label}
      title={tab.disabledReason ?? tab.label}
      className={`relative h-auto min-w-0 flex-col gap-0 px-field py-field aria-disabled:opacity-50 data-active:bg-primary/10 data-active:text-primary ${CELL_EDGE_CLASSES[edge]}`}
      {...(disabled ? { "aria-disabled": true } : {})}
    >
      {tab.icon !== undefined ? <Icon icon={tab.icon} size="sm" /> : null}
      <Text as="span" size="micro" weight="medium" className="max-w-full truncate">
        {tab.label}
      </Text>
      {disabled ? <Icon icon={Lock} size="xs" aria-hidden={true} className="absolute right-0 top-0 text-muted-foreground" /> : null}
      {disabled || isActive ? null : <RpgHudCellBadge count={count} dot={tab.badge === true} />}
    </TabsTab>
  );
}

function RpgHudCellBadge({ count, dot }: { readonly count: number; readonly dot: boolean }): ReactElement | null {
  if (count > 0) {
    return (
      <Badge intent="primary" size="sm" aria-hidden={true} className="absolute right-0 top-0">
        {count}
      </Badge>
    );
  }
  // The boolean form is the same primitive with no content — a features-tier surface never paints a raw
  // element, so the dot is a childless `Badge` sized down, not a styled `<span>`.
  return dot ? <Badge intent="primary" size="sm" aria-hidden={true} className="absolute right-0 top-0 size-1.5 rounded-full p-0" /> : null;
}
