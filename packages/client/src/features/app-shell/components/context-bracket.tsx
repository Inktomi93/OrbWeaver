// THE CONTEXT BRACKET — the ONE column every `kind:"tabs"` CONTEXT pane renders (owner-ruled 2026-08-30, #860:
// "the RPG room's head-and-foot split is the INTENDED shape of the context panel"; the mock is
// `docs/design/mocks/context-bracket/`). It is the rpg HUD's column (`rpg-hud.tsx`, HUD-1 §7, 2026-08-01)
// moved into the shell tier and made universal: a normal room, a game room and a character all wear it, and
// there is no second renderer left for the strip to fork through (#845 measured the fork; this ends it).
//
// THE COLUMN, top to bottom: HEAD BAND (flex-none — the artifact's identity: a room's title + chips, the
// Waystone, a character's portrait; ONE slot, three contents, never a second head) → TOP RAIL (flex-none, the
// `strip:"game"` state tabs — present only when one resolved: APPLICABILITY, Context-Panel-Program §4.1) →
// VIEWPORT (`flex-initial` = `flex: 0 1 auto` + min-h-0 + scroll) → GROUND (`flex-1`, the residual span) →
// FOOT RAIL (flex-none, the `strip:"meta"` tabs, pinned to the pane's foot — owner decision 6, universal).
//
// THE VIEWPORT IS `flex-initial`, NOT `flex-1` (§7.1 — the dead-zone rule, F6 defect 4): a SHORT body takes
// its natural height instead of stretching a half-empty scroll region over the whole pane; a TALL body
// shrinks the viewport to the space available and scrolls internally. The GROUND absorbs exactly the
// residual space — ZERO on a tall body, so the foot rail sits in the same place in both states and there is
// no layout jump between them (asserted as geometry in CT, never eyeballed). A rail floating ~400px above
// the pane's bottom edge is neither a stable Fitts target nor a legible floor (the 2026-08-01 ruling).
//
// THE PANE'S EDGES ARE THE BRACKET'S: shell.css drops `.shell-panel-body`'s padding under a bracket (keyed
// on `data-context-bracket`, written HERE and nowhere else — the single-writer probe handle the geometry CTs
// and `pnpm snap --eval` resolve, gate `context-definition-shape` arm 8), so the band and both rails reach
// the pane's edges full-bleed; the VIEWPORT re-pays that padding itself, so tab bodies read as before. The
// 2px ember content↔context binding (north-star §4 N4/P4) is painted HERE, on the root, from the theme's own
// primary token (`border-primary/55` — exactly as the rpg HUD's band painted it since HUD-1; owner ruling
// 2026-08-30: shell.css is geometry, colour is a theme token resolved per theme block, never shell CSS).
//
// WHAT IT DOES NOT DO: no panel mechanics (width/mode/close/scrim stay `PanelChrome`'s, D62), no CSS of its
// own beyond the shell's, no second selection store (`view.selectTab` writes the shared `contextTab`), no
// re-resolution (it renders the handed `node`s and never calls `body`/`when` itself). The FLOATING pane's
// way out (side-eye 2026-08-06 P2 — "the close sits where the thing it closes is") rides INSIDE the band's
// top-right corner as a glyph button, never a separate chrome row: the mock's band is flush with the sheet's
// top, and a phone cannot reach the scrim under a 100dvw sheet.

import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Tabs, TabsPanel } from "@orb/ui/tabs";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { ContextRegionView, ResolvedContextTab } from "#lib";
import { GAME_STRIP_LABEL } from "#lib";
import { cellDomId } from "../lib/context-cell-id.ts";
import { ContextRail } from "./context-rail.tsx";

export interface ContextBracketProps {
  /** The resolved tabs + the ONE selection seam + the host's rail-trail actions. */
  readonly view: ContextRegionView;
  /** The HEAD band's content — the section's `header` or a claiming region's band. Absent ⇒ no band. */
  readonly band?: ReactNode;
  /** The FOOT rail's name: the artifact noun the pane is about ("Chat", "Character", or the section). */
  readonly railLabel: string;
  /** The floating pane's own way out (overlay mode only) — rendered into the band's top-right corner. */
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
}

/** What ONE rail prints after its own name — the selected tab's label, and ONLY on the rail that owns the
 *  selection. `null` on the receded rail and when nothing is selected: a rail that does not hold the view
 *  claims no state, in its kicker exactly as in its cells' `aria-current`. */
function railSelection(active: ResolvedContextTab | null, strip: ResolvedContextTab["strip"]): string | null {
  return active !== null && active.strip === strip ? active.label : null;
}

// THE META RAIL RENDERS ITS TABS IN DECLARED ORDER, AND THAT IS THE ACCEPTED ORDER (#898, ruled
// 2026-08-30 by the post-fix verification drive). A `seatCrownsLast` partition lived here for one day and
// is DELETED, not repaired, because it was a no-op certified by a false pin:
//   · #875 F15 asked for `Game` last, on the premise that it was "the crowned host-only door wedged
//     between two GENERIC meta tabs". That premise is wrong on the tree — `Preview`
//     (`chats-section.tsx:98`), `Game` (`rpg-context-section.tsx`) and `Activity`
//     (`activity-context-tab.tsx:28`) ALL carry `crown: true`, verified live from `data-crown` in both
//     rooms. The reviewer retracted the premise on the baseline's behalf.
//   · So partitioning on the crown FLAG yielded `[Members, This chat] + [Preview, Game, Activity]` —
//     byte-identical to the order it claimed to change. Only `Game`'s ICON is a literal crown; the flag is
//     a host-only marker that three cells share, so no predicate over it can ever move `Game` alone.
//   · Its CT went green solely because the story fixture crowned `Game` alone. A no-op plus a lying pin is
//     the banned half-migration, and that pin would have certified an order the product never rendered for
//     as long as it lived.
// If the owner wants `Game` last it is an explicit ORDER field on the tab definition, decided on a later
// word — never a predicate guessed from a flag that means something else.

export function ContextBracket({ view, band, railLabel, dismissLabel, onDismiss }: ContextBracketProps): ReactElement {
  const gameTabs = view.tabs.filter((tab) => tab.strip === "game");
  const metaTabs = view.tabs.filter((tab) => tab.strip === "meta");
  // WHICH RAIL OWNS THE SELECTION — the one fact neither strip's renderer could know before (F6 defect 1).
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
      // THE COLUMN HAS NO SEAM OF ITS OWN: each slot pays its own padding (the band's, the rails' kicker and
      // cell rows, the viewport's re-paid pane padding), exactly as the mock lays them — `gap-0` overrides the
      // tabs primitive's own `gap-block` base, which #146 made a deterministic merge.
      className="flex h-full min-h-0 flex-col gap-0 border-t-2 border-primary/55"
    >
      {hasBand || hasDismiss ? (
        <Stack
          data-slot="context-bracket-band"
          gap="row"
          // The band wears the RAISED fill — the same `bg-surface-raised` the owning rail wears, so the
          // pane's two "own" surfaces read as one material (the mock's `--raised` on `.band` and `.rail.own`,
          // and `--raised` IS this token; retuned off `sidebar-accent/40` by #875 F2 — the ownership map in
          // context-rail.tsx carries the measurement and the reason). `pe-control-md` only while the dismiss
          // occupies the corner: the title must not run under the X.
          className={`relative shrink-0 bg-surface-raised px-block py-row ${hasDismiss ? "pe-control-md" : ""}`}
        >
          {band}
          {hasDismiss ? (
            <Button
              aria-label={dismissLabel ?? "Close panel"}
              data-slot="context-bracket-dismiss"
              intent="ghost"
              onClick={onDismiss}
              size="icon"
              type="button"
              className="absolute end-field top-field"
            >
              <Icon icon={X} size="sm" />
            </Button>
          ) : null}
        </Stack>
      ) : null}
      {gameTabs.length > 0 ? (
        <ContextRail
          ariaLabel={GAME_STRIP_LABEL}
          tabs={gameTabs}
          activeTab={view.activeTab}
          edge="top"
          owns={activeStrip === "game"}
          kicker={GAME_STRIP_LABEL}
          selection={railSelection(active, "game")}
        />
      ) : null}
      {/* One viewport, ALL tabs — a meta body opens in the same scroll region as a state body (owner decision 4);
          nothing about a body changes when the bracket draws the frame around it. The padding is the bracket's
          own now (the shell's panel-body padding is dropped under it), so a body keeps its breathing room while
          the chrome around it reaches the pane's edges. */}
      {/* #908 — only mount a tab's subtree once it has been selected at least once. The TabsPanel
          shell is always rendered (Base UI needs it for its `inert`/`hidden` bookkeeping), but its
          CHILDREN are deferred until first visit, cutting the initial commit-phase cost from 169-214ms
          to only the active tab's tree. */}
      {view.tabs.map((tab) => (
        <TabsPanel
          key={tab.id}
          value={tab.id}
          // `region`, not the primitive's `tabpanel` — see the ARIA-model note in context-rail.tsx: with the
          // rails announcing as toolbars there is no tab in the document for a tabpanel to belong to.
          role="region"
          aria-labelledby={cellDomId(tab.id)}
          className="relative min-h-0 flex-initial overflow-y-auto overscroll-contain px-row py-row"
        >
          {visited.has(tab.id) ? tab.node : null}
        </TabsPanel>
      ))}
      {/* THE PHONE'S GROUND IS A RULED, ACCEPTED VOID (#899 N8, owner-ruled 2026-08-30). The post-fix drive
          measured ~250-300px of empty ground under both the chat and character panes at 430, and the
          ruling is: the sheet KEEPS full height and the pinned foot rail — the ground/foot-stability
          contract holds on every viewport, and the sheet is never content-sized. A pane MAY claim its
          ground with real, applicability-gated, per-artifact content, under the #864 furniture ban
          verbatim: an arm with nothing honest to show renders NOTHING, and a QUIET VOID IS AN ACCEPTED
          OUTCOME — never padding, never a decorative shelf.
          BOTH PANES WERE ASSESSED AND BOTH ARMS CLOSED AS "quiet void accepted". Receipts: neither tab body
          withholds anything at a phone width (zero width/pointer conditionals in
          `character-overview-card.tsx` or `committed-members-tab.tsx` — the 430 void is not hidden content,
          it is the residual), and neither pane holds a query whose LOADED data could earn the space —
          Characters has `character.get` (already fully rendered as Origin · Activity · Tags) and a
          page-of-ONE `chat.listChats` (only `totalCount` + the newest thread, both already spent), so more
          threads would be a SECOND REQUEST, which the ruling bans (reuse what the pane already has — the
          `CollectionContribution.preview` discipline, a second reader of a loaded list, never a second
          fetch). Re-open this only when a pane gains a read whose data is already loaded and unspent. */}
      {/* THE GROUND — the residual span between a short body and the pinned foot rail (§7.1's "HUD ground",
          re-decided on real screenshots: bare background read as truncation, not as a floor). It is the pane's
          floor, so it is treated as one — the surface tint gathering toward the foot, nothing to read, no border
          to mistake for a divider. Purely presentational ⇒ `aria-hidden`. On a tall body it measures ZERO. */}
      <Stack data-slot="context-bracket-ground" aria-hidden={true} className="min-h-0 flex-1 bg-linear-to-b from-transparent to-surface-raised" />
      {metaTabs.length > 0 ? (
        <ContextRail
          ariaLabel={railLabel}
          tabs={metaTabs}
          activeTab={view.activeTab}
          actions={view.actions}
          edge="bottom"
          owns={activeStrip === "meta"}
          kicker={railLabel}
          selection={railSelection(active, "meta")}
        />
      ) : null}
    </Tabs>
  );
}
