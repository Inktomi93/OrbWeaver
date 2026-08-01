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
// stay shared — they arrive already resolved.
//
// THE VOICE PASS (H2 — F6 defects 1 + 3) is what one owner of both rails buys, and it is the whole reason the
// fold in §4 is worth its duplication:
//   · SELECTION ECHOES ACROSS THE SPLIT (defect 1). The rail holding the selection is the OWNING rail: it
//     wears the resting surface fill and its captions step up to the foreground; the other RECEDES to muted
//     glyphs over bare ground. The band then names the winner in one kicker line ("Game · Status" /
//     "Chat · This chat"). No renderer could do either before — neither strip knew the other's state, and the
//     band belonged to a third party 870px away.
//   · THE ADMIN RAIL IS A TAB GROUP, NOT AN ACTION BAR (defect 3). It gets a KICKER — its own name, on
//     screen, in the same micro-caps voice every rpg section header uses — and that kicker's hairline rule IS
//     the rail's top edge, so naming the group costs one line and no extra divider. Only the ADMIN rail
//     carries one: the game rail sits directly under the band it belongs to, the echo already names it, and
//     a second kicker row spends vertical budget §7.1 caps at 30%.
// The grammar is the four VOICES + the tier map (§7.4, density S1): every text here passes `voice`, never a
// size/weight/tone triple, so the pane's hierarchy is declared rather than negotiated per call site.

import { Badge } from "@orb/ui/badge";
import { Icon, Lock } from "@orb/ui/icons";
import { Row, Stack, Surface } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
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

/** The cell's DOM id — the anchor each viewport panel names as its accessible label (§3.6 fence 6). Base UI
 *  associates a panel with its tab only within ONE list; the HUD deals two rails off one `Tabs` root, which
 *  breaks that lookup and left the active tabpanel with no accessible name at all. Naming both ends from the
 *  tab id is the one-home fix (pinned by the a11y CT). */
function cellDomId(tabId: string): string {
  return `rpg-hud-cell-${tabId}`;
}

/** The band's SELECTION ECHO (§7.3 — the band's last line): which rail owns the selection, and what it
 *  landed on. `null` when nothing is selected (there is no answer to echo). The `kicker` voice upper-cases
 *  it, so the labels stay in their declared casing here and read "GAME · STATUS" on screen. */
function selectionEcho(tabs: readonly ResolvedContextTab[], activeTab: string | null): string | null {
  const active = tabs.find((tab) => tab.id === activeTab);
  return active === undefined ? null : `${active.strip === "game" ? RAIL_NAME.game : RAIL_NAME.meta} · ${active.label}`;
}

/** The two rails' own names — ONE home, so the echo, the kicker and the a11y group label cannot drift.
 *  `game` reads "Game state", not "Game": the crown GM console in the ADMIN rail is a TAB named "Game", and
 *  two sibling groups where one's name is the other's member collide for anyone navigating by name. */
const RAIL_NAME: Readonly<Record<ResolvedContextTab["strip"], string>> = { game: "Game state", meta: "Chat" };

export function RpgHud({ view }: RpgHudProps): ReactElement {
  const gameTabs = view.tabs.filter((tab) => tab.strip === "game");
  const adminTabs = view.tabs.filter((tab) => tab.strip === "meta");
  // WHICH RAIL OWNS THE SELECTION — the one fact neither strip's renderer could know before (F6 defect 1).
  const activeStrip = view.tabs.find((tab) => tab.id === view.activeTab)?.strip ?? null;
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
        className="flex h-full min-h-0 flex-col gap-0"
      >
        <RpgHudBand echo={selectionEcho(view.tabs, view.activeTab)} />
        {gameTabs.length > 0 ? (
          <RpgHudRail ariaLabel={RAIL_NAME.game} tabs={gameTabs} activeTab={view.activeTab} edge="top" owns={activeStrip === "game"} />
        ) : null}
        {/* One viewport, ALL tabs — an admin body opens in the same scroll region as a state body (owner
            decision 4); nothing about a body changes when the HUD draws the frame around it. The padding is
            the HUD's own now (the shell's panel-body padding is dropped under a claim), so a body keeps its
            breathing room while the chrome around it reaches the pane's edges. */}
        {view.tabs.map((tab) => (
          <TabsPanel key={tab.id} value={tab.id} aria-labelledby={cellDomId(tab.id)} className="min-h-0 flex-initial overflow-y-auto px-row py-row">
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
 *  ITS LAST LINE IS THE SELECTION ECHO (§7.3 / F6 defect 1): the rail that owns the selection, then the tab.
 *  `aria-hidden` deliberately — the rails already announce their own selection, and a second announcement of
 *  the same fact is noise; this is the VISUAL half, for a reader whose eye is 870px from the strip that
 *  changed. It sits OUTSIDE the band's query boundary because it is the HUD's own chrome, not a game read:
 *  a failed tracker fetch collapses the waystone, and the pane still says what you are looking at. */
function RpgHudBand({ echo }: { readonly echo: string | null }): ReactElement | null {
  const chatId = useActiveChatId();
  if (chatId === null) {
    return null;
  }
  return (
    <Stack data-slot="rpg-hud-band" gap="row" className="shrink-0 border-t-2 border-primary/55 px-block py-row">
      <QueryBoundary fallback={null} renderError={(): null => null}>
        <RpgHeaderBand chatId={chatId} />
      </QueryBoundary>
      {echo === null ? null : (
        <Text as="span" voice="kicker" aria-hidden={true} data-slot="rpg-hud-echo" className="truncate">
          {echo}
        </Text>
      )}
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

/** THE OWNERSHIP TREATMENT (§4's last two rows — half of the F6 defect-1 fix). The rail holding the
 *  selection carries a resting surface fill and lifts its captions to the foreground; the other has no
 *  resting fill at all and stays at the primitive's muted step. The contrast is what makes a selection
 *  visible across a split neither strip could see across before — and it is stated as ONE map so the two
 *  states can never be tuned apart. */
const RAIL_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "bg-sidebar-accent/40",
  receded: "",
};
const CELL_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "text-foreground",
  receded: "",
};

/** THE CROWN INHERITS THE RECEDE (side-eye 08-01). Crown gold marks a host-only cell (§4), but it was
 *  painted as an absolute `text-highlight` on the glyph — so a RECEDED admin rail's brightest pixel was its
 *  crown, and the quiet strip announced itself louder than the strip holding the selection. The gold is a
 *  treatment WITHIN a rail's own voice, so it steps with that voice: full gold while the rail owns, the
 *  cell's inherited (muted) colour while it recedes. Stated as the same one-map idiom the two ownership
 *  treatments above use, so the two states can never be tuned apart. */
const CROWN_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "text-highlight",
  receded: "text-inherit",
};

/** The narrow-panel WRAP (side-eye 08-01, measured at the panel's 17rem/272px floor): six cells on one
 *  `auto-cols-fr` row give ~44px each, and four of the six captions clipped to ~3 characters — a rail of
 *  three-letter stubs is the icon-only defect (F6 #2) wearing text. Below the `xs` container step (20rem —
 *  the SAME `--container-*` scale the waystone's size mapping steps on, never a viewport query) a rail of
 *  more than four cells lays out as ROWS of three instead, which buys each caption ~85px and keeps every
 *  word whole. A short rail (the admin rail's 3-4 cells) never wraps: it already fits.
 *
 *  The threshold is the `xs` step and not something tighter because the clipping starts THERE, not only at
 *  the floor: measured in CT at a 320px pane, "Inventory" wants 48px of caption inside a 36px cell. */
const RAIL_WRAP_CLASS = "@max-xs:grid-flow-row @max-xs:grid-cols-3";
const RAIL_WRAP_MIN_CELLS = 5;

/** One rail: its OWN labelled a11y group + roving-focus row, cells as equal columns so the rail reads as a
 *  solid frame rather than bitsy buttons bunched left (the 2026-07-28 owner ruling, carried over).
 *
 *  THE KICKER (§4, F6 defect 3) names the group ON SCREEN, and its hairline rule doubles as the rail's own
 *  edge — which is why a kicker'd rail drops the track border it would otherwise draw: one line, not two.
 *  It is `aria-hidden` because the `TabsList` already carries the same word as the group's accessible name;
 *  announcing "Chat" twice is the noise, not the fix. The anatomy (micro-caps + rule to the edge) is the
 *  rpg `Kicker`'s, spelled here in the `voice` grammar §7.4 asks the HUD to speak — that component predates
 *  the voices and is a section header inside tab BODIES, while this is the pane's own chrome. */
function RpgHudRail({
  ariaLabel,
  tabs,
  activeTab,
  actions,
  edge,
  owns,
  kicker,
}: {
  readonly ariaLabel: string;
  readonly tabs: readonly ResolvedContextTab[];
  readonly activeTab: string | null;
  readonly actions?: ContextRegionView["actions"];
  readonly edge: "top" | "bottom";
  readonly owns: boolean;
  readonly kicker?: string;
}): ReactElement {
  const ownership = owns ? "owning" : "receded";
  const track = kicker === undefined ? RAIL_EDGE_CLASSES[edge] : "border-y-0";
  return (
    <Stack data-slot="rpg-hud-rail" data-owns={owns} gap="tight" className="min-w-0 shrink-0">
      {/* The kicker is INSET to the band's inline rhythm while the rail itself stays full-bleed — the rail
          is the pane's floor and reaches its edges (§5.2), a word floating against them does not. */}
      {kicker === undefined ? null : (
        <Row gap="field" align="center" aria-hidden={true} data-slot="rpg-hud-rail-kicker" className="px-block">
          <Text as="span" voice="kicker">
            {kicker}
          </Text>
          <Separator className="flex-1" />
        </Row>
      )}
      <Row align="center" gap="row" className="min-w-0">
        <TabsList
          aria-label={ariaLabel}
          className={`grid min-w-0 w-full auto-cols-fr grid-flow-col gap-field ${tabs.length >= RAIL_WRAP_MIN_CELLS ? RAIL_WRAP_CLASS : ""} ${track} ${RAIL_OWNERSHIP_CLASSES[ownership]}`}
        >
          {tabs.map((tab) => (
            <RpgHudCell key={tab.id} tab={tab} isActive={tab.id === activeTab} edge={edge} ownership={ownership} />
          ))}
        </TabsList>
        {actions !== undefined ? (
          <Row align="center" className="shrink-0">
            {actions}
          </Row>
        ) : null}
      </Row>
    </Stack>
  );
}

/** One cell: glyph + caption, ALWAYS both (§7.2) — `layout="stacked"`, the primitive's OWN arm for a cell
 *  whose height follows its content. A call-site `h-auto` cannot express that: the sealed `h-control-sm` is
 *  opaque to tailwind-merge and wins on stylesheet order, which is precisely how the captions shipped
 *  clipped to a 5px sliver. The caption is the accessible name AND visible — the panel is never wide enough
 *  for the shared strip's container-query reveal to fire, so an icon-only game rail was permanent, not
 *  "compressed" (F6 defect 2). `title` is NOT the caption's understudy (§7.2): the word is on screen and
 *  `aria-label` carries the full name when it truncates, so a hover tooltip on every cell was pure noise.
 *
 *  PHASE-locked (the Map): a LOCK glyph + the reason on `title` — which, beside an `aria-label`, is the
 *  cell's accessible DESCRIPTION, so AT hears the promise too. It is deliberately NOT `aria-disabled`: the
 *  locked tab OPENS onto a body that states when the feature arrives (RV-7, built on owner review), and a
 *  control announcing "unavailable" while Enter opens it is two stories. One story: a real tab wearing a
 *  lock, where mouse, keyboard and AT all get the same answer. */
function RpgHudCell({
  tab,
  isActive,
  edge,
  ownership,
}: {
  readonly tab: ResolvedContextTab;
  readonly isActive: boolean;
  readonly edge: "top" | "bottom";
  readonly ownership: "owning" | "receded";
}): ReactElement {
  const locked = tab.disabledReason !== null;
  const count = typeof tab.badge === "number" ? tab.badge : 0;
  // CROWN GOLD AT REST (§4): the host-only cells (`preview`, the crown GM console) read as host-only
  // without spending a word on it. AT REST only — once the cell is active the accent state colour is the
  // answer to "where am I", and a gold glyph inside an accent cell would argue with it. And at rest the gold
  // rides its RAIL'S ownership voice (`CROWN_OWNERSHIP_CLASSES`), so a receded strip's crown recedes with it.
  const crowned = tab.crown && !isActive;
  return (
    <TabsTab
      layout="stacked"
      value={tab.id}
      id={cellDomId(tab.id)}
      aria-label={tab.label}
      data-crown={tab.crown}
      className={`relative min-w-0 data-active:bg-primary/10 data-active:text-primary ${CELL_EDGE_CLASSES[edge]} ${CELL_OWNERSHIP_CLASSES[ownership]}`}
      {...(tab.disabledReason !== null ? { title: tab.disabledReason } : {})}
    >
      {tab.icon !== undefined ? <Icon icon={tab.icon} size="sm" className={crowned ? CROWN_OWNERSHIP_CLASSES[ownership] : ""} /> : null}
      {/* voice=gloss for the grammar; text-inherit so the cell's own state color (data-active accent) wins. */}
      <Text as="span" voice="gloss" data-slot="rpg-hud-cell-caption" className="max-w-full truncate text-inherit">
        {tab.label}
      </Text>
      {locked ? <Icon icon={Lock} size="xs" aria-hidden={true} className="absolute right-0 top-0 text-muted-foreground" /> : null}
      {locked || isActive ? null : <RpgHudCellBadge count={count} dot={tab.badge === true} />}
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
