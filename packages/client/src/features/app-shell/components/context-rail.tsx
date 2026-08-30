// ONE RAIL OF THE CONTEXT BRACKET — the kicker that names the group, the roving-focus row of cells, and the
// cell itself. This is the rpg HUD's rail (`features/rpg/components/rpg-hud-rail.tsx`, 2026-08-17) moved into
// the shell tier by the context bracket (#860, owner-ruled 2026-08-30): the SAME rail renders the meta tabs at
// the foot of EVERY tabs pane and the state tabs above the viewport wherever a `strip:"game"` tab resolved,
// so the two rooms can never be tuned apart — which is the property the whole ruling depends on.
// `context-bracket.tsx` owns the pane's VERTICAL COMPOSITION (band → rail → viewport → ground → rail); this
// file owns what one rail IS, and the bracket's ARIA model + the wrap/ownership/crown maps live here.
//
// ── THE ARIA MODEL (#112, 2026-08-16 — now universal) — NAMED TOOLBARS, ONE CURRENT CELL ───────────────
//
// The rails are NOT `tablist`s and the cells are NOT `tab`s, deliberately. The bracket deals two rails off ONE
// `Tabs` root with ONE shared selection (the viewport sits BETWEEN them, so one DOM tablist is ruled out) —
// and a tablist whose selection lives in the OTHER rail announces with ZERO selected tabs. Measured both
// directions; a screen-reader user entering the quiet rail heard a chooser with nothing chosen. A normal room
// has one rail and could be an honest tablist, but ONE rail implementation is the ruling (#845 measured the
// fork; #860 ended it): the same markup in every pane, so a reader learns the panel once.
//   · the RAIL is `role="toolbar"` + its `aria-label` — a named set of related controls, and a contract this
//     rail keeps: Base UI's composite gives the rail ONE tab stop with arrow keys inside it.
//   · the CELL drops `role`/`aria-selected` (`CELL_ARIA_STRIP`) and carries `aria-current="true"` while it
//     holds the view — so a rail without the selection claims no state at all.
//   · the VIEWPORT panel is `role="region"` named by its cell (the bracket's half of `cellDomId`).
// ACTIVATION IS MANUAL ON BOTH RAILS (side-eye #102, 2026-08-17) — arrows move FOCUS, Enter/Space selects.
// `@orb/ui`'s `TabsList` seals `activateOnFocus={true}` and this is the one consumer that must not take it:
// the panels behind these cells are query-backed surfaces, and MEASURED, a keyboard user crossing the game
// rail with two ArrowRights committed two selections and mounted six query-backed panels on the way to the
// one they wanted. The a11y pattern names exactly this as the reason to choose manual.
//
// THE VOICE PASS (H2 — F6 defects 1 + 3): the rail holding the selection is the OWNING rail — it wears the
// raised surface fill (the same fill the head band wears) and prints "NAME · SELECTION" in its kicker; the
// other RECEDES to muted glyphs over bare ground and prints its bare name. The KICKER SITS ON TOP OF ITS
// CELLS in both rails (DESIGN.md — the kicker names the cells beneath it; nothing renders under the cells
// but the pane's edge), and its hairline rule is the seam between the word and the cells.

import { Badge } from "@orb/ui/badge";
import { Icon, Lock } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { TabsList, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CONTEXT_CELL_FLOOR_AT_COARSE, CONTEXT_RAIL_WRAP, CONTEXT_RAIL_WRAPPED_EDGE_BAR_OFF } from "#components";
import type { ContextRegionView, ResolvedContextTab } from "#lib";
import { cellDomId } from "../lib/context-cell-id.ts";

/** THE CELL'S ARIA STRIP (#112) — spread onto the cell to DELETE the two attributes the tabs primitive
 *  emits for a tab it no longer is: Base UI merges external props last, and the element under it is a real
 *  `<button>`, so a `role` of `undefined` leaves the native button role. */
const CELL_ARIA_STRIP = { role: undefined, "aria-selected": undefined } as const;

/** The active bar sits on the cell's BOTTOM edge in BOTH rails (the mock's `.cell.on::after{bottom}` —
 *  restated for the top rail too, so the two rails carry one treatment). For the top rail that is the
 *  seam with the viewport it selects; for the foot rail it is the pane's own edge.
 *
 *  "ONE ROW" IS A CLAIM, so the bar stands down in the state where it stops holding:
 *  `CONTEXT_RAIL_WRAPPED_EDGE_BAR_OFF` (its own note carries the 272px measurement and the mechanism).
 *  In the wrapped arm a first-row cell's bottom edge is the seam above row TWO. */
const CELL_EDGE_CLASSES = `border-b-2 border-transparent data-active:border-primary ${CONTEXT_RAIL_WRAPPED_EDGE_BAR_OFF}`;

/** THE OWNERSHIP TREATMENT (half of the F6 defect-1 fix; the receded arm re-ruled for #861). The rail
 *  holding the selection carries the raised surface fill — the SAME fill the head band wears, so the two
 *  "own" surfaces of the pane read as one material — lifts its captions to the foreground, and its KICKER
 *  steps up with them. The other RECEDES — but recedes ONTO SOMETHING: the receded rail had NO fill at all,
 *  and side-eye measured what that reads as (#861, 2026-08-30): a caps "CHAT" + hairline typographically
 *  identical to every section heading, brighter (8.50:1) than the owning kicker (4.97:1) because it sat on
 *  bare ground, over five unfilled cells whose bottom edge WAS the viewport edge. A person reads that as a
 *  dead section header dangling at the pane's foot. So the receded rail wears a quieter step of the same
 *  fill, its kicker stays at the muted ink while the owning one lifts, and the cell row pays a floor below
 *  the cells (`pb-row`) so nothing ends on the pane's edge. Stated as ONE map per axis so the two states
 *  can never be tuned apart. */
const RAIL_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "bg-sidebar-accent/40",
  receded: "bg-sidebar-accent/15",
};
// The mock's cells (`ChatRoom.dc.html`): a resting cell is the muted step on BOTH rails and only the ACTIVE
// cell lifts to the foreground — the owning rail is told apart by its fill and its kicker's selection half,
// not by brightening every caption; the receded rail's cells step one alpha quieter (its `opacity: .85`).
const CELL_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "",
  receded: "text-muted-foreground/70",
};
const KICKER_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "",
  receded: "text-muted-foreground/70",
};

/** THE CROWN INHERITS THE RECEDE (side-eye 08-01). Crown gold marks a host-only cell, but painted as an
 *  absolute `text-highlight` a RECEDED rail's brightest pixel was its crown. The gold is a treatment WITHIN
 *  a rail's own voice, so it steps with that voice: full gold while the rail owns, the cell's inherited
 *  (muted) colour while it recedes. */
const CROWN_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "text-highlight",
  receded: "text-inherit",
};

/** The narrow-panel WRAP (side-eye 08-01, measured at the panel's 17rem/272px floor): six cells on one
 *  `auto-cols-fr` row give ~44px each, and four of the six captions clipped to ~3 characters. Below the
 *  `xs` container step a SIX-cell rail lays out as ROWS of three instead (`CONTEXT_RAIL_WRAP` — a
 *  FINE-pointer answer; a phone stays one row and scrolls, the 320×568 measurement is in that fragment's
 *  note). ONLY a rail that folds EVENLY takes it (#861, side-eye 2026-08-30: at 1024×768 the five-cell
 *  foot rail folded 3+2 and left a ragged void beside the orphan pair). Every other rail SCROLLS instead —
 *  `RAIL_TRACK_CLASSES` below keeps each cell at its whole caption and lets the row overflow. */
const RAIL_WRAP_CELLS = 6;

/** THE READABLE-CAPTION FLOOR, ON EVERY RAIL (#208, 2026-08-18) — the track-sizing function, unconditional.
 *  `minmax(max-content, 1fr)`: the `1fr` MAX keeps the cells equal columns filling the rail whenever there
 *  is slack (the 2026-07-28 owner ruling against "bitsy buttons bunched left"); the `max-content` MIN
 *  refuses to shrink a cell below its whole caption, so where the cells no longer fit the tracks OVERFLOW
 *  and `overflow-x-auto` scrolls them. Degrade to a scroll, never into an ellipsis. NOT gated on the cell
 *  count: MEASURED at the 272px floor the chat rail's four `auto-cols-fr` cells were 51px each against a
 *  58px "Members", and both clipped. The FOLD stays count-gated because it answers a different question. */
const RAIL_TRACK_CLASSES = "auto-cols-[minmax(max-content,1fr)] overflow-x-auto";

export interface ContextRailProps {
  readonly ariaLabel: string;
  readonly tabs: readonly ResolvedContextTab[];
  readonly activeTab: string | null;
  readonly actions?: ContextRegionView["actions"];
  /** Which edge of the viewport this rail sits on — `top` = the state rail, `bottom` = the meta rail
   *  pinned to the pane's foot (owner decision 6, universal since #860). */
  readonly edge: "top" | "bottom";
  /** Does this rail hold the selection? The owning rail is raised and names the selection. */
  readonly owns: boolean;
  /** The rail's on-screen name — the same word as `ariaLabel` (one home per rail, never a drifting twin). */
  readonly kicker: string;
  /** The selected tab's label when this rail owns it; `null` on the receded rail. */
  readonly selection: string | null;
}

/** One rail: its OWN labelled a11y group + roving-focus row, cells as equal columns so the rail reads as a
 *  solid frame rather than bitsy buttons bunched left (the 2026-07-28 owner ruling, carried over).
 *
 *  THE KICKER names the group ON SCREEN, on top of the cells it names, and its hairline rule is the seam
 *  between the word and the cells. The FOOT rail also carries a hairline on its TOP edge — its boundary
 *  with the ground; the TOP rail does not (the band's own bottom seam is that line). It is `aria-hidden`
 *  because the `TabsList` already carries the same word as the group's accessible name; announcing "Chat"
 *  twice is the noise, not the fix.
 *
 *  AND IT CARRIES THE SELECTION when this rail owns it — "CHAT · MEMBERS" on the rail holding the view, the
 *  bare name on the one that is not — at EVERY pointer. The old HUD dropped the selection half at a coarse
 *  pointer (a judgment about the deleted band echo's position); the mock's 430 arms print it, and the datum
 *  now sits 4px above the cell it names. */
export function ContextRail({ ariaLabel, tabs, activeTab, actions, edge, owns, kicker, selection }: ContextRailProps): ReactElement {
  const ownership = owns ? "owning" : "receded";
  return (
    <Stack data-slot="context-rail" data-owns={owns} data-edge={edge} className={`min-w-0 shrink-0 ${RAIL_OWNERSHIP_CLASSES[ownership]}`}>
      <Row
        gap="field"
        align="baseline"
        aria-hidden={true}
        data-slot="context-rail-kicker"
        className={`border-border border-b px-block py-tight ${edge === "bottom" ? "border-t" : ""}`}
      >
        <Text as="span" voice="kicker" className={`min-w-0 truncate ${KICKER_OWNERSHIP_CLASSES[ownership]}`}>
          {kicker}
          {/* THE SELECTION HALF MOVES ONE AXIS OFF THE NAME (side-eye #102, 2026-08-17: measured byte-identical on
              all five computed axes, "GAME STATE · STATUS" read as one flat string rather than a group NAME
              followed by what it holds). The axis is COLOUR — the mock's `.kick .sel { color: var(--fg) }`: the
              datum steps up to the foreground while the name keeps the kicker's muted ink; size, weight,
              tracking and casing stay the kicker's, so the two halves are still one typographic line and the
              breadcrumb reads left to right. (The HUD moved WEIGHT instead; the owner-ruled mock moves colour,
              which is also what makes the OWNING kicker the brighter of the two — #861.) A nested `Text`, not a
              raw span (a feature may not paint a raw element), carrying the SAME voice; `text-foreground` as a
              className because a voice re-spells its own colour and wins the `tone` merge. Its own `data-slot`
              replaces the primitive's. */}
          {selection === null ? null : <Text as="span" voice="kicker" data-slot="context-rail-selection" className="text-foreground">{` · ${selection}`}</Text>}
        </Text>
      </Row>
      <Row align="center" gap="row" className="min-w-0 px-row pt-field pb-row">
        <TabsList
          // `toolbar`, not the primitive's `tablist` — see the ARIA-model note in the header. The composite's
          // one-tab-stop-plus-arrows behaviour is exactly a toolbar's contract, and it is the only container
          // role here that does not imply a selection this rail may not be holding.
          role="toolbar"
          // MANUAL ACTIVATION — arrows MOVE, Enter/Space SELECTS (side-eye #102, 2026-08-17).
          activateOnFocus={false}
          aria-label={ariaLabel}
          className={`grid min-w-0 w-full ${RAIL_TRACK_CLASSES} grid-flow-col gap-tight ${tabs.length === RAIL_WRAP_CELLS ? CONTEXT_RAIL_WRAP : ""} border-y-0`}
        >
          {tabs.map((tab) => (
            <ContextCell key={tab.id} tab={tab} isActive={tab.id === activeTab} ownership={ownership} />
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

/** One cell: glyph + caption, ALWAYS both (#208) — `layout="stacked"`, the primitive's OWN arm for a cell
 *  whose height follows its content. The caption is the accessible name AND visible; `title` is NOT the
 *  caption's understudy (the word is on screen and `aria-label` carries the full name when it truncates).
 *
 *  ACTIVE: the ember fill + foreground ink + the 2px primary bar on the bottom edge (the mock's `.cell.on`).
 *  PHASE-locked (the Map): a LOCK glyph + the reason on `title` + a dimmed cell — deliberately NOT
 *  `aria-disabled`: the locked cell OPENS onto a body that states when the feature arrives (RV-7), and a
 *  control announcing "unavailable" while Enter opens it is two stories. One story, in every pane: a real
 *  cell wearing a lock, where mouse, keyboard and AT all get the same answer. */
function ContextCell({
  tab,
  isActive,
  ownership,
}: {
  readonly tab: ResolvedContextTab;
  readonly isActive: boolean;
  readonly ownership: "owning" | "receded";
}): ReactElement {
  const locked = tab.disabledReason !== null;
  const count = typeof tab.badge === "number" ? tab.badge : 0;
  // CROWN GOLD AT REST: the host-only cells read as host-only without spending a word on it. AT REST only —
  // once the cell is active the accent state is the answer to "where am I", and a gold glyph inside an
  // accent cell would argue with it. At rest the gold rides its RAIL'S ownership voice.
  const crowned = tab.crown && !isActive;
  return (
    <TabsTab
      layout="stacked"
      value={tab.id}
      id={cellDomId(tab.id)}
      // THE CELL IS A BUTTON, NOT A TAB (#112 — the ARIA-model note in the header). The strip deletes
      // `role`/`aria-selected`, and `aria-current` carries the same fact honestly — ABSENT on every cell of
      // the rail that is not holding the view.
      {...CELL_ARIA_STRIP}
      aria-current={isActive ? true : undefined}
      // THE LOCK IS IN THE NAME (side-eye 2026-08-06 ARIA): Base UI emits `aria-disabled="false"` on this
      // cell (it is genuinely not disabled), so a glyph-only lock was one AT could not perceive. The visible
      // caption stays the prefix of the accessible name (WCAG 2.5.3 Label-in-Name).
      aria-label={locked ? `${tab.label} — locked` : tab.label}
      data-crown={tab.crown}
      // NO `min-w-0` HERE, EVER (#146): with the spacing scale registered in tailwind-merge a call-site
      // `min-w-0` wins outright and deletes the ≥44px floor the primitive's `min-w-touch-target` carries
      // (MEASURED at 320 coarse: the cells fell to 39px). The coarse HEIGHT floor is the bracket's own:
      // `CONTEXT_CELL_FLOOR_AT_COARSE` (56px — the first token step at or above the mock's 52px cells).
      className={`relative data-active:bg-primary/15 data-active:text-foreground ${CELL_EDGE_CLASSES} ${CELL_OWNERSHIP_CLASSES[ownership]} ${CONTEXT_CELL_FLOOR_AT_COARSE} ${locked ? "opacity-60" : ""}`}
      {...(tab.disabledReason !== null ? { title: tab.disabledReason } : {})}
    >
      {tab.icon !== undefined ? <Icon icon={tab.icon} size="sm" className={crowned ? CROWN_OWNERSHIP_CLASSES[ownership] : ""} /> : null}
      {/* voice=LABEL, not `gloss` (side-eye #102): this caption is the pane's PRIMARY NAVIGATION, and `gloss` is
          the 10.5px `micro` step — under the 11px readable floor. The mock draws its captions at 10.5px and is
          NOT followed on this axis: the readable-floor ruling stands. text-inherit so the cell's own state
          colour still wins. */}
      <Text as="span" voice="label" data-slot="context-cell-caption" className="max-w-full truncate text-inherit">
        {tab.label}
      </Text>
      {/* THE CORNER ORNAMENTS SIT ONE `field` OFF THE CELL'S OWN CORNER (side-eye 2026-08-16 #94): the rail is
          full-bleed, so the LAST cell's inline-end edge IS the pane's edge and a flush glyph read as clipped.
          LOGICAL (`end-*`), never `right-*`. Spelled as a whole literal at each site (not hoisted) because
          `ui-size-via-variant` reads these class strings statically. */}
      {locked ? <Icon icon={Lock} size="xs" aria-hidden={true} className="absolute end-field top-field text-muted-foreground" /> : null}
      {locked || isActive ? null : <ContextCellBadge count={count} dot={tab.badge === true} />}
    </TabsTab>
  );
}

function ContextCellBadge({ count, dot }: { readonly count: number; readonly dot: boolean }): ReactElement | null {
  if (count > 0) {
    return (
      <Badge intent="primary" size="sm" aria-hidden={true} className="absolute end-field top-field">
        {count}
      </Badge>
    );
  }
  // The boolean form is the same primitive with no content — a shell-tier surface never paints a raw
  // element, so the dot is a childless `Badge` sized down, not a styled `<span>`.
  return dot ? <Badge intent="primary" size="sm" aria-hidden={true} className="absolute end-field top-field size-1.5 rounded-full p-0" /> : null;
}
