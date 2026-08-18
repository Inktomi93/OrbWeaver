// The rpg HUD — the WHOLE CONTEXT pane on an engaged game chat (HUD-1 §3.1/§4/§7). The panel no longer
// rents chrome from the shell: this component owns the vertical composition end to end, which is what makes
// the F6 defects fixable at all (nobody owned it before — the band was the shell's, the strips were the
// shell's, the bodies were the feature's, and the arrangement was an accident of three specs).
//
// THE COLUMN, top to bottom: BAND (flex-none — the waystone, painting the 2px primary content↔context binding
// edge itself now that no `.shell-panel-header` sits above it) → GAME rail (flex-none, the state tabs) →
// VIEWPORT (`flex-initial` = `flex: 0 1 auto` + min-h-0 + scroll) → GROUND (`flex-1`, the residual span) →
// ADMIN rail (flex-none, the chat tabs).
//
// THE VIEWPORT IS `flex-initial`, NOT `flex-1` (§7.1 — the dead-zone rule, F6 defect 4): a SHORT body takes
// its natural height instead of stretching a half-empty scroll region over the whole pane; a TALL body
// shrinks the viewport to the space available and scrolls internally. The generic panel's `flex-1` law is
// right for a details pane that always fills; it is wrong for a HUD.
//
// THE ADMIN RAIL IS PINNED TO THE PANE'S FOOT and the span between the body and it is the HUD's GROUND (the
// 2026-08-01 side-eye ruling on owner decision 6, taken on real screenshots): a rail floating ~400px above
// the pane's bottom edge is neither a stable Fitts target nor a legible floor. The GROUND element absorbs
// exactly the residual space — ZERO on a tall body, so the rail sits in the same place in both states and
// there is no layout jump between them (asserted as geometry in CT, never eyeballed).
//
// THE PANE'S EDGES ARE THE HUD'S: shell.css drops `.shell-panel-body`'s padding under a claim, so the band's
// primary edge paints flush at the pane's top edge, full-bleed, exactly as the generic band's inset one does
// (§5.2 — "the claimant owns the pane's TOP EDGE"). The VIEWPORT re-pays that padding itself, so tab bodies
// read as before; only the chrome (band, rails, ground) reaches the pane's edges.
//
// WHAT IT DOES NOT DO (§3.6 fences): no panel mechanics (width/mode/close/scrim stay the shell's, D62), no
// CSS (composed from `@orb/ui` primitives + token utilities — `.ctx-tab-strip` is the shell's and a gate arm
// makes reaching for it RED), no second selection store (`view.selectTab` writes the shared `contextTab`),
// no re-resolution (it renders the handed `node`s and never calls `body`/`when` itself).
//
// The tab CELL is the HUD's own: rail membership, the always-visible caption (§7.2 — the "compressed form is
// the only form" defect dies here), the active treatment and the PHASE-locked treatment are arrangement, and
// arrangement is exactly what forked. The resolution, selection, `when`-gating, badge and disabled VALUES all
// stay shared — they arrive already resolved. THE RAIL AND ITS CELL LIVE IN `rpg-hud-rail.tsx` (split out
// 2026-08-17 under the `component-size` cap): this file owns the pane's vertical COMPOSITION, that one owns
// what a rail IS, and the HUD's ARIA model + the wrap/ownership/crown maps went with it.
//
// THE VOICE PASS (H2 — F6 defects 1 + 3) is what one owner of both rails buys, and it is the whole reason the
// fold in §4 is worth its duplication:
//   · SELECTION ECHOES ACROSS THE SPLIT (defect 1). The rail holding the selection is the OWNING rail: it
//     wears the resting surface fill and its captions step up to the foreground; the other RECEDES to muted
//     glyphs over bare ground. The OWNING RAIL NAMES THE WINNER IN ITS OWN KICKER LINE ("GAME STATE · STATUS"
//     / "CHAT" at rest; "GAME STATE" / "CHAT · MEMBERS" once a chat tab takes the view). No renderer could do
//     that before — neither strip knew the other's state.
//   · BOTH RAILS ARE TAB GROUPS, NOT ACTION BARS (defect 3). Each gets a KICKER — its own name, on screen,
//     in the same micro-caps voice every rpg section header uses — and that kicker's hairline rule IS the
//     rail's own edge, so naming the group costs one line and no extra divider.
//
// THE 2026-08-17 RE-RULE (owner pick of tracker mockup variant A on #102) — stated in full because a later
// reader will otherwise re-derive the ruling it replaces. THE SUPERSEDED RULING, verbatim from this header
// until today: "Only the ADMIN rail carries one: the game rail sits directly under the band it belongs to,
// the echo already names it, and a second kicker row spends vertical budget §7.1 caps at 30%" — the echo
// being a `kicker`-voiced line the BAND printed as its last row. The mockup measured that line and both of
// its premises failed:
//   · IT NAMED THE WRONG THING. Live at a 383px panel the echo sat 8.0px under the satellite row and 20.0px
//     above the game rail — binding ratio 1:2.5 pointing UP at the medallions — while wearing a voice
//     identical to the orb captions on four of five computed axes (10.5px / uppercase / 0.84px tracking /
//     the same muted ink; only weight differed, 600 vs 400). On a CHAT selection it read "CHAT · MEMBERS"
//     8px under the coin with the rail it named 524px further down the pane.
//   · THE BUDGET OBJECTION WAS ANSWERED ON ITS OWN TERMS, not overruled. The second kicker row is PAID FOR
//     by deleting the echo line and its gap: measured in CT at the same 383×800 geometry, chrome is 346.0px
//     against the echo era's 347.0px — a wash by construction (echo 13.1px + 8px gap out; kicker 13.1px +
//     4px gap + 4px lead in), CT-pinned at ≤347 (the "PAYS FOR ITSELF" test). The mockup's projected 341.7px
//     (−5.3) came from its hand-built 49px cells vs the app's real 50.1px — the projection, not the receipt.
// So the echo's MECHANISM survives and its ambiguity dies: the sentence prints ON the rail it describes.
// At a coarse pointer, where the echo used to be dropped whole, the kicker keeps the NAME and sheds only
// the "· Selection" half — the part a phone still needs, at no cost to the rail it already pays for.
// The grammar is the four VOICES + the tier map (§7.4, density S1): every text here passes `voice`, never a
// size/weight/tone triple, so the pane's hierarchy is declared rather than negotiated per call site.

import { Stack, Surface } from "@orb/ui/layout";
import { Tabs, TabsPanel } from "@orb/ui/tabs";
import type { ReactElement } from "react";
import { QueryBoundary } from "#data";
import type { ContextRegionView, ResolvedContextTab } from "#lib";
import { useActiveChatId } from "#state";
import { cellDomId } from "../lib/hud-cell-id.ts";
import { RpgHeaderBand } from "./rpg-header-band.tsx";
import { RpgHudRail } from "./rpg-hud-rail.tsx";

export interface RpgHudProps {
  readonly view: ContextRegionView;
}

/** What ONE rail prints after its own name — the selected tab's label, and ONLY on the rail that owns the
 *  selection (§7.3 as re-ruled by the #102 owner pick, see the header). `null` on the receded rail and when
 *  nothing is selected: a rail that does not hold the view claims no state, in its kicker exactly as in its
 *  cells' `aria-current`. The `kicker` voice upper-cases it, so the labels stay in their declared casing
 *  here and read "GAME STATE · STATUS" on screen. */
function railSelection(active: ResolvedContextTab | null, strip: ResolvedContextTab["strip"]): string | null {
  return active !== null && active.strip === strip ? active.label : null;
}

/** The two rails' own names — ONE home, so a rail's KICKER and its a11y group label cannot drift.
 *  `game` reads "Game state", not "Game": the crown GM console in the ADMIN rail is a TAB named "Game", and
 *  two sibling groups where one's name is the other's member collide for anyone navigating by name. */
const RAIL_NAME: Readonly<Record<ResolvedContextTab["strip"], string>> = { game: "Game state", meta: "Chat" };

export function RpgHud({ view }: RpgHudProps): ReactElement {
  const gameTabs = view.tabs.filter((tab) => tab.strip === "game");
  const adminTabs = view.tabs.filter((tab) => tab.strip === "meta");
  // WHICH RAIL OWNS THE SELECTION — the one fact neither strip's renderer could know before (F6 defect 1).
  const active = view.tabs.find((tab) => tab.id === view.activeTab) ?? null;
  const activeStrip = active?.strip ?? null;
  return (
    // THE PANE IS INSTRUMENT TIER (§7.4; density-pass-spec §3.1 names this exact surface) — read-mostly,
    // glanceable, many data per cm². Declaring it is what makes every island inside the pane resolve the
    // dense steps instead of each body picking padding by taste; `<Surface>` is `display: contents`, so it
    // states the tier without adding a box to the flex column the vertical budget depends on.
    <Surface tier="instrument">
      <Tabs
        value={view.activeTab}
        onValueChange={(value): void => {
          if (typeof value === "string") {
            view.selectTab(value);
          }
        }}
        // THE COLUMN SEAM IS DECLARED, NOT INHERITED (side-eye #102, 2026-08-17). This class read `gap-0`
        // and had NEVER been in effect: `gap-block` is the tabs primitive's own base, and tailwind-merge
        // did not then dedupe a CUSTOM-TOKEN gap against the numeric scale, so both classes survived and
        // stylesheet order gave the primitive the win — MEASURED `gap: 12px`, four 12px seams (band ↔ game
        // rail ↔ viewport ↔ ground ↔ admin rail). Every vertical measurement this file's CTs pin was
        // therefore taken against a value the source denied. The 12px seam is KEPT (it is the geometry the
        // #102 rendered pass verified: 24px medallions → kicker, 4px kicker → cells) and now SAYS SO. That
        // merge-config fix HAS landed (#146 — the spacing scale is registered, a call-site gap wins), and
        // nothing here moved, which is exactly what declaring the seam bought.
        className="flex h-full min-h-0 flex-col gap-block"
      >
        <RpgHudBand />
        {gameTabs.length > 0 ? (
          <RpgHudRail
            ariaLabel={RAIL_NAME.game}
            tabs={gameTabs}
            activeTab={view.activeTab}
            edge="top"
            owns={activeStrip === "game"}
            kicker={RAIL_NAME.game}
            selection={railSelection(active, "game")}
          />
        ) : null}
        {/* One viewport, ALL tabs — an admin body opens in the same scroll region as a state body (owner
            decision 4); nothing about a body changes when the HUD draws the frame around it. The padding is
            the HUD's own now (the shell's panel-body padding is dropped under a claim), so a body keeps its
            breathing room while the chrome around it reaches the pane's edges. */}
        {view.tabs.map((tab) => (
          <TabsPanel
            key={tab.id}
            value={tab.id}
            // `region`, not the primitive's `tabpanel` — see the ARIA-model note above `cellDomId`: with the
            // rails announcing as toolbars there is no tab in the document for a tabpanel to belong to.
            role="region"
            aria-labelledby={cellDomId(tab.id)}
            className="relative min-h-0 flex-initial overflow-y-auto px-row py-row"
          >
            {tab.node}
          </TabsPanel>
        ))}
        <RpgHudGround />
        {adminTabs.length > 0 ? (
          <RpgHudRail
            ariaLabel={RAIL_NAME.meta}
            tabs={adminTabs}
            activeTab={view.activeTab}
            actions={view.actions}
            edge="bottom"
            owns={activeStrip === "meta"}
            kicker={RAIL_NAME.meta}
            selection={railSelection(active, "meta")}
          />
        ) : null}
      </Tabs>
    </Surface>
  );
}

/** The HUD's own BAND — the waystone composite, plus the 2px primary top edge the shell's band used to paint
 *  (the content↔context binding survives; it just gets painted by its owner now, §5.1).
 *
 *  The chat id comes from `#state`'s active-chat pointer, not from the claimant's `S`: the region `render`
 *  deliberately receives only the shell view, so a claimant's domain state comes from its own hooks (§3.2).
 *  The claim only holds for a committed game chat, so the pointer is present whenever this renders.
 *
 *  The band is DECORATION over the same reads the tab bodies own: on error it collapses to nothing (its own
 *  boundary, `renderError → null`) so a failed read is the ONE announced surface in the body, never a second
 *  generic error block above it.
 *
 *  IT NO LONGER CARRIES THE SELECTION ECHO (#102 owner pick, 2026-08-17 — the header states the re-rule and
 *  the superseded ruling in full). The band ends with the composite it owns; the sentence naming the
 *  selection moved onto the rail that holds it, where its referent is 4px away instead of 20-524px. */
function RpgHudBand(): ReactElement | null {
  const chatId = useActiveChatId();
  if (chatId === null) {
    return null;
  }
  return (
    <Stack data-slot="rpg-hud-band" gap="row" className="shrink-0 border-t-2 border-primary/55 px-block py-row">
      <QueryBoundary fallback={null} renderError={(): null => null}>
        <RpgHeaderBand chatId={chatId} />
      </QueryBoundary>
    </Stack>
  );
}

/** THE GROUND — the residual span between a short body and the pinned admin rail (§7.1's "HUD ground",
 *  re-decided on real screenshots: bare background read as truncation, not as a floor). It is the pane's
 *  floor, so it is treated as one — the surface tint gathering toward the foot, nothing to read, no border
 *  to mistake for a divider. Purely presentational ⇒ `aria-hidden`. On a tall body it measures ZERO (a
 *  `flex-1` with a zero basis under a viewport that wants the room), which is what makes the rail's position
 *  identical in both states. */
function RpgHudGround(): ReactElement {
  return <Stack data-slot="rpg-hud-ground" aria-hidden={true} className="min-h-0 flex-1 bg-linear-to-b from-transparent to-sidebar-accent/40" />;
}
