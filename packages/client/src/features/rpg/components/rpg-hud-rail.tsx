// ONE RAIL OF THE rpg HUD — the kicker that names the group, the roving-focus row of cells, and the cell
// itself. Split out of `rpg-hud.tsx` on 2026-08-17 when the #102 owner pick gave the GAME rail a kicker too
// and the single file passed the 450-line `component-size` cap; the seam is the honest one — `rpg-hud.tsx`
// owns the pane's VERTICAL COMPOSITION (band → rail → viewport → ground → rail) and this file owns what one
// rail IS. Both rails render through here, so the two can never be tuned apart, which is the property half
// the F6 defect-1 fix depends on.
//
// The pane-level law — the column, the viewport's `flex-initial`, the pinned admin rail, the §3.6 fences,
// the voice grammar, and the 2026-08-17 re-rule of the selection echo — stays in `rpg-hud.tsx`'s header and
// is not restated here.

import { Badge } from "@orb/ui/badge";
import { Icon, Lock } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { TabsList, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { HIDE_AT_COARSE, RPG_RAIL_WRAP, RPG_RAIL_WRAPPED_EDGE_BAR_OFF } from "#components";
import type { ContextRegionView, ResolvedContextTab } from "#lib";
import { cellDomId } from "../lib/hud-cell-id.ts";

/** THE CELL'S ARIA STRIP (#112) — see the ARIA-model block below. Spread onto the cell to DELETE the two
 *  attributes the tabs primitive emits for a tab it no longer is: Base UI merges external props last, and
 *  the element under it is a real `<button>`, so a `role` of `undefined` leaves the native button role. */
const CELL_ARIA_STRIP = { role: undefined, "aria-selected": undefined } as const;

/** ── THE HUD'S ARIA MODEL (#112, 2026-08-16) — TWO NAMED TOOLBARS, ONE CURRENT CELL ────────────────────
 *
 *  The rails are NOT `tablist`s and the cells are NOT `tab`s, deliberately. The HUD deals two rails off ONE
 *  `Tabs` root with ONE shared selection (§7.1 puts the viewport BETWEEN them, so one DOM tablist is ruled
 *  out) — and a tablist whose selection lives in the OTHER rail announces with ZERO selected tabs. Measured
 *  both directions; a screen-reader user entering the quiet rail heard a chooser with nothing chosen.
 *
 *  What each rail's own call site says instead (the ONE place with the two-rail problem — the shared
 *  `@orb/ui` tabs seal keeps its honest tablist for every single-rail consumer):
 *    · the RAIL is `role="toolbar"` + its `aria-label` — a named set of related controls, and a contract this
 *      HUD keeps: Base UI's composite gives the rail ONE tab stop with arrow keys inside it. That roving
 *      behaviour, the panel wiring, the active `data-*` treatment and every pixel are untouched here; only
 *      the announced ROLES move.
 *    · the CELL drops `role`/`aria-selected` (`CELL_ARIA_STRIP`) and carries `aria-current="true"` while it
 *      holds the view — so a rail without the selection claims no state at all.
 *    · the VIEWPORT panel is `role="region"` named by its cell: a `tabpanel` with no tab in the document is
 *      a dangling promise, and a named region is what it actually is.
 *  ACTIVATION IS MANUAL ON BOTH RAILS (side-eye #102, 2026-08-17) — arrows move FOCUS, Enter/Space selects.
 *  `@orb/ui`'s `TabsList` seals `activateOnFocus={true}` (automatic activation, the ARIA tabs pattern's
 *  default for a CHEAP panel swap) and this is the one consumer that must not take it, so the rail passes
 *  the Base UI prop through. The panels behind these ten cells are not cheap: each is a query-backed rpg
 *  surface, and MEASURED, a keyboard user crossing the game rail with two ArrowRights committed two
 *  selections and mounted six query-backed panels on the way to the one they wanted (208ms on the slow
 *  keydown). The a11y pattern permits either mode and names exactly this as the reason to choose manual:
 *  "if the panel's content is not preloaded, use manual activation". It costs one keystroke at the
 *  destination and buys a rail you can traverse without firing every tab you pass. Base UI activates a
 *  cell from its `onClick`, and the cell is a native `<button>`, so Enter/Space keep working with no
 *  key handler of our own — the ONE prop is the whole change.
 *
 *  Rejected: `aria-owns`-ing one conceptual tablist across both rails — it announces a 10-tab group whose
 *  arrow keys stop dead at the rail boundary (the composites are per-list, with the viewport between them)
 *  and costs both rail NAMES; a worse contract than the one it fixes.
 *
 *  The cell's DOM id — the anchor each viewport panel names as its accessible label (§3.6 fence 6). Base UI
 *  associates a panel with its tab only within ONE list; the HUD deals two rails off one `Tabs` root, which
 *  breaks that lookup and left the active panel with no accessible name at all. Naming both ends from the
 *  cell id is the one-home fix (pinned by the a11y CT) — and that one home is `../lib/hud-cell-id.ts`,
 *  because the OTHER end of the name is the viewport panel in `rpg-hud.tsx`. */

/** The cells' active bar faces INWARD, toward the viewport between the rails: the GAME rail (above) marks
 *  its bottom edge, the ADMIN rail (below) its top. A marker on the outside edge dangles against the panel
 *  frame instead of binding the rail to the content it selects. (The rail's own TRACK border is gone from
 *  both rails — each kicker's hairline rule is that rail's edge now, one line and not two.)
 *
 *  "INWARD" IS A CLAIM ABOUT A ONE-ROW RAIL, so the bar stands down in the state where the claim stops
 *  holding: `RPG_RAIL_WRAPPED_EDGE_BAR_OFF` (its own note carries the 272px measurement and the mechanism).
 *  In the wrapped arm a first-row cell's bottom edge is the seam above row TWO, not the viewport. */
const CELL_EDGE_CLASSES: Readonly<Record<"top" | "bottom", string>> = {
  top: `border-b-2 border-transparent data-active:border-primary ${RPG_RAIL_WRAPPED_EDGE_BAR_OFF}`,
  bottom: `border-t-2 border-transparent data-active:border-primary ${RPG_RAIL_WRAPPED_EDGE_BAR_OFF}`,
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
 *  word whole. A short rail (the admin rail's 3-4 cells) never wraps — it takes the second row's cost for
 *  one lonely cell — and instead SCROLLS, which is `RAIL_TRACK_CLASSES` below. (This note read "it already
 *  fits" until 2026-08-18. It did not: at four cells the 272px floor gives 51px a cell against a 58px
 *  "Members". The fold and the no-clip floor were one bundled declaration, and unbundling them is #208.)
 *
 *  The threshold is the `xs` step and not something tighter because the clipping starts THERE, not only at
 *  the floor: measured in CT at a 320px pane, "Inventory" wants 48px of caption inside a 36px cell.
 *
 *  AND THE WRAP IS A FINE-POINTER ANSWER (side-eye 2026-08-07 finding 2). Two rows of three costs a second
 *  55px band, which a desktop pane in a narrow dock can afford and a phone cannot: MEASURED at 320×568, the
 *  claimed pane is 464px, this rail took 105 of it, and the active tabpanel was left EIGHTEEN pixels against
 *  a 558px body. At a coarse pointer the rail stays ONE row and SCROLLS instead, which is the phone
 *  tab-strip idiom and costs 50px instead of 105. Base UI's roving focus is unchanged, and the browser
 *  scrolls a focused cell into view, so the keyboard reaches every tab either way.
 *
 *  THE ROW'S TRACK SIZING IS `minmax(max-content, 1fr)` — stated once here, applied to every rail at every
 *  width by `RAIL_TRACK_CLASSES` below (it was the COARSE row's alone when this paragraph was written; #208
 *  found the fine short-rail hole it left). The first shape
 *  of that fix put the coarse cells at their CONTENT width (`auto-cols-max`), and MEASURED at 430 coarse it
 *  produced Status 43 · Inventory 60 · Scene 41 · Quests 46 · Journal 47 · Map 34 — three of six under the
 *  44px touch floor — with the six cells ending at x=302 and 127px of DEAD RAIL after them: word for word
 *  the "bitsy buttons bunched left" this function's own header says an owner ruled against on 2026-07-28.
 *  Neither `max-content` nor `1fr` alone satisfies all three constraints this rail is under, and the three
 *  are not negotiable against each other:
 *    · `auto-cols-max` → whole captions, but bunched left AND below the floor (the measured defect).
 *    · `auto-cols-fr`  → equal columns and full rail, but at a 320-375px pane the equal share is ~48px and
 *      "Inventory" clips — re-buying the icon-only defect (F6 #2) the caption rule exists to end.
 *    · `minmax(max-content, 1fr)` → the fr MAX makes the cells equal columns filling the rail whenever there
 *      is slack (measured 67px a cell at 430, no dead strip), and the max-content MIN refuses to shrink a
 *      caption: where the six no longer fit, the tracks OVERFLOW and `overflow-x-auto` scrolls them. The row
 *      degrades to scrolling, never below the floor and never into an ellipsis.
 *  The ≥44px floor itself is NOT spelled here — it is `TabsTab`'s own sealed `min-w-touch-target`, which
 *  raises each track's max-content minimum, so a cell whose caption is narrower than a thumb ("Map") still
 *  gets a thumb's width. The bracket is a track-sizing FUNCTION, not an off-token size (the
 *  `grid-cols-[repeat(auto-fit,minmax(…))]` precedent in `@orb/ui`'s layout variants); `auto-cols` carries no
 *  token scale to spell it with. The vertical budget is untouched — the rail is one 50px row either way. */
// The pointer-keyed literal lives at the shell/shared layer (`#components/pointer-variants.ts`, gate
// `no-pointer-variants-in-features`); the measured rationale above is the rpg HUD's own and stays here.
const RAIL_WRAP_CLASS = RPG_RAIL_WRAP;
const RAIL_WRAP_MIN_CELLS = 5;

/** THE READABLE-CAPTION FLOOR, ON EVERY RAIL (#208, 2026-08-18) — the track-sizing function, unconditional.
 *
 *  `minmax(max-content, 1fr)`: the `1fr` MAX keeps the cells equal columns filling the rail whenever there
 *  is slack (the 2026-07-28 owner ruling against "bitsy buttons bunched left"); the `max-content` MIN
 *  refuses to shrink a cell below its whole caption, so where the cells no longer fit the tracks OVERFLOW
 *  and `overflow-x-auto` scrolls them. Degrade to a scroll, never into an ellipsis.
 *
 *  IT IS NOT GATED ON THE CELL COUNT, and that is the whole fix. `RAIL_WRAP_MIN_CELLS` gates the FOLD —
 *  whether a long rail is worth a second 55px row — and until today it also gated this, on the premise
 *  (stated in the wrap note above) that "a short rail (the admin rail's 3-4 cells) never wraps: it already
 *  fits". The Members tab falsified that premise the day it landed: MEASURED at the panel's 272px floor the
 *  chat rail's four `auto-cols-fr` cells are 51px each against a 58px "Members" and a 54px "This chat", and
 *  both clipped (the 2026-08-18 red at rpg-context-section.ct.tsx's wrapped-floor caption test, bisected to
 *  the Members merge). A count was standing in for "does the word fit", and CSS can answer that question
 *  exactly. The FOLD stays count-gated because it answers a different one: a 4-cell rail folding to 3+1
 *  spends a whole extra row on one lonely cell and doubles the chrome in the pane where the budget is
 *  tightest, while a 6-cell rail scrolling 150px hides half itself — so the short rail scrolls and the long
 *  rail folds, and neither ever clips a word. */
const RAIL_TRACK_CLASSES = "auto-cols-[minmax(max-content,1fr)] overflow-x-auto";

/** THE RAIL BLOCK'S OWN LEAD — the separation it buys ABOVE its kicker (#102 variant A's measured anatomy).
 *  Only the GAME rail needs it: it follows the band, whose satellite row ends `spacing-row` (8px) above,
 *  and 8px alone is the proximity the deleted echo lost on — the kicker has to sit FURTHER from the
 *  medallions than from its own cells. `spacing-tight` on top of the band's own padding and the HUD
 *  column's own `gap-block` seam puts the label 24px under the orbs and 4px over the tabs: 6:1 the right
 *  way. The ADMIN rail follows the GROUND, which is empty space by construction, so it buys nothing.
 *
 *  TRUTH-REPAIR (side-eye #102, 2026-08-17): this note read "~12px under the orbs … 3:1" until today. That
 *  12 was the MOCKUP'S PROJECTION and was never the shipped number — the rendered pass measured 24.0px
 *  above and 4.0px below, i.e. 6:1, and the CT that pins it has asserted `above >= below * 3` (a floor, not
 *  the value) since the kicker landed. The extra 12 is the HUD column's seam, which `rpg-hud.tsx` only
 *  started DECLARING today; the lead this constant buys is still the 4px `tight` step on top of it. The
 *  shipped-and-verified geometry is 24/4 — the projection is kept here so the next reader does not
 *  "restore" a number the pane never rendered. */
const RAIL_LEAD_CLASSES: Readonly<Record<"top" | "bottom", string>> = { top: "pt-tight", bottom: "" };

/** One rail: its OWN labelled a11y group + roving-focus row, cells as equal columns so the rail reads as a
 *  solid frame rather than bitsy buttons bunched left (the 2026-07-28 owner ruling, carried over).
 *
 *  THE KICKER (§4, F6 defect 3) names the group ON SCREEN, and its hairline rule doubles as the rail's own
 *  edge — which is why a kicker'd rail drops the track border it would otherwise draw: one line, not two.
 *  It is `aria-hidden` because the `TabsList` already carries the same word as the group's accessible name;
 *  announcing "Chat" twice is the noise, not the fix. The anatomy (micro-caps + rule to the edge) is the
 *  rpg `Kicker`'s, spelled here in the `voice` grammar §7.4 asks the HUD to speak — that component predates
 *  the voices and is a section header inside tab BODIES, while this is the pane's own chrome.
 *
 *  AND IT CARRIES THE SELECTION when this rail owns it (#102, 2026-08-17 — the re-rule is stated in full in
 *  `rpg-hud.tsx`'s header): "GAME STATE · STATUS" on the rail holding the view, the bare name on the one
 *  that is not. */
export function RpgHudRail({
  ariaLabel,
  tabs,
  activeTab,
  actions,
  edge,
  owns,
  kicker,
  selection,
}: {
  readonly ariaLabel: string;
  readonly tabs: readonly ResolvedContextTab[];
  readonly activeTab: string | null;
  readonly actions?: ContextRegionView["actions"];
  readonly edge: "top" | "bottom";
  readonly owns: boolean;
  readonly kicker: string;
  readonly selection: string | null;
}): ReactElement {
  const ownership = owns ? "owning" : "receded";
  return (
    <Stack data-slot="rpg-hud-rail" data-owns={owns} gap="tight" className={`min-w-0 shrink-0 ${RAIL_LEAD_CLASSES[edge]}`}>
      {/* The kicker's WORD is INSET to the band's inline rhythm; its RULE is not. The rail is the pane's
          floor and reaches its edges (§5.2), a word floating against them does not — but the header's own
          claim is that this hairline IS the rail's edge, and `px-block` inset the `Separator` too, so the
          "edge" stopped 12px short of the cells below it (side-eye #102, MEASURED at the 272px floor: the
          kicker row spans the full 271px while the rule ends a block short of the full-bleed cell row).
          `ps-block` insets the START only: the word keeps the band's rhythm and the rule runs out to the
          rail's own end edge, which is the line the header has always described. */}
      <Row gap="field" align="center" aria-hidden={true} data-slot="rpg-hud-rail-kicker" className="ps-block">
        <Text as="span" voice="kicker" className="min-w-0 truncate">
          {kicker}
          {/* THE SELECTION HALF STANDS DOWN AT A COARSE POINTER (the echo's side-eye 2026-08-07 finding 2,
              inherited): on a 320px column the owning rail is a thumb's width from the band and the tab it
              names is the cell right below the word, so the datum is the half a phone can spend. The NAME
              is not — that is the part the old echo dropped entirely and this arm keeps. It is a nested
              `Text` and not a raw span (a feature may not paint a raw element — `no-restricted-syntax`),
              carrying the SAME voice so the two halves stay one typographic line; its own `data-slot`
              replaces the primitive's, which is what keeps the outer line the kicker's only `text` slot.

              IT STANDS ONE AXIS QUIETER THAN THE NAME (side-eye #102, 2026-08-17). Measured, the two halves
              were byte-identical on all five computed axes — 10.5px / 600 / 0.84px tracking / the same
              muted ink / the same caps — so "GAME STATE · STATUS" read as one flat string rather than a
              group NAME followed by what it currently holds. The regular weight is the ONE axis that moves:
              size, tracking, colour and casing stay the kicker's, so the two halves are still one
              typographic line and the breadcrumb still reads left to right. `font-normal` and not
              `weight="regular"` because the `weight` variant is declared BEFORE `voice` and the voice's own
              `font-semibold` wins that merge — the className is the only spelling that lands. */}
          {selection === null ? null : (
            <Text as="span" voice="kicker" data-slot="rpg-hud-rail-selection" className={`font-normal ${HIDE_AT_COARSE}`}>{` · ${selection}`}</Text>
          )}
        </Text>
        <Separator className="flex-1" />
      </Row>
      <Row align="center" gap="row" className="min-w-0">
        <TabsList
          // `toolbar`, not the primitive's `tablist` — see the ARIA-model note above `cellDomId`. The
          // composite's one-tab-stop-plus-arrows behaviour is exactly a toolbar's contract, and it is the
          // only container role here that does not imply a selection this rail may not be holding.
          role="toolbar"
          // MANUAL ACTIVATION — arrows MOVE, Enter/Space SELECTS (side-eye #102, 2026-08-17). See the
          // ARIA-model block above `cellDomId` for why this rail overrides the primitive's seal default.
          activateOnFocus={false}
          aria-label={ariaLabel}
          className={`grid min-w-0 w-full ${RAIL_TRACK_CLASSES} grid-flow-col gap-field ${tabs.length >= RAIL_WRAP_MIN_CELLS ? RAIL_WRAP_CLASS : ""} border-y-0 ${RAIL_OWNERSHIP_CLASSES[ownership]}`}
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
 *  whose height follows its content. A call-site `h-auto` does not express that: pre-#146 the sealed
 *  `h-control-sm` was opaque to tailwind-merge and won on stylesheet order — precisely how the captions
 *  shipped clipped to a 5px sliver — and post-#146 the call site wins instead, which quietly breaks the
 *  seal rather than naming the arm (the `min-w-0` note at the cell below is the same lesson, measured).
 *  The caption is the accessible name AND visible — the panel is never wide enough
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
      // THE CELL IS A BUTTON, NOT A TAB (#112 — the ARIA-model note above `cellDomId`). The strip deletes
      // `role`/`aria-selected` (the latter is only defined on a tab; on a button it is an invalid attribute),
      // and `aria-current` carries the same fact honestly — ABSENT on every cell of the rail that is not
      // holding the view, which is the whole defect: no rail announces as a chooser with nothing chosen.
      {...CELL_ARIA_STRIP}
      aria-current={isActive ? true : undefined}
      // THE LOCK IS IN THE NAME (side-eye 2026-08-06 ARIA). The glyph said "locked" to the eye and `title`
      // carried the reason, but Base UI emits `aria-disabled="false"` on this cell (it is genuinely not
      // disabled — see the block comment above), so AT heard "Map, tab" and nothing else: a lock a screen
      // reader cannot perceive. `title` is only the DESCRIPTION, which many readers announce late, after a
      // verbosity setting, or not at all. The visible caption ("Map") stays the prefix of the accessible
      // name, so WCAG 2.5.3 Label-in-Name still holds and "click Map" still resolves.
      aria-label={locked ? `${tab.label} — locked` : tab.label}
      data-crown={tab.crown}
      // NO `min-w-0` HERE, EVER (#146). It used to sit in this list and was pure luck that it did nothing:
      // the custom spacing scale was unregistered in tailwind-merge, so it survived beside `TabsTab`'s
      // sealed `min-w-touch-target` and lost on stylesheet order alone (`.min-w-0` is emitted before
      // `.min-w-touch-target`). With the scale registered the call site wins the merge outright, which
      // deletes the ≥44px floor the block comment above delegates to the primitive for — MEASURED at 320
      // coarse, the cells fell to 39px.
      className={`relative data-active:bg-primary/10 data-active:text-primary ${CELL_EDGE_CLASSES[edge]} ${CELL_OWNERSHIP_CLASSES[ownership]}`}
      {...(tab.disabledReason !== null ? { title: tab.disabledReason } : {})}
    >
      {tab.icon !== undefined ? <Icon icon={tab.icon} size="sm" className={crowned ? CROWN_OWNERSHIP_CLASSES[ownership] : ""} /> : null}
      {/* voice=LABEL, not `gloss` (side-eye #102, 2026-08-17): this caption is the pane's PRIMARY NAVIGATION,
          and `gloss` is the 10.5px `micro` step — under the 11px readable floor at BOTH pointers, on all ten
          cells. It was the largest single block of undersized interactive text left in the panel, and the
          #102 home leg had already driven sub-11px interactive text 7→0 on the same grounds (the `credit`
          voice's own note states the rule: caps/tracking carry a register, the STEP carries legibility).
          `label` is the 13px step and is what the word IS — the name of one datum, the cell it labels. The
          rail absorbs the wider caption without clipping: below the `xs` container step it already wraps to
          rows of three, and at or above it `RPG_RAIL_WRAP`'s `minmax(max-content,1fr)` tracks scroll rather
          than ellipsize, which is the degradation that arm exists for. text-inherit so the cell's own state
          color (data-active accent) still wins. */}
      <Text as="span" voice="label" data-slot="rpg-hud-cell-caption" className="max-w-full truncate text-inherit">
        {tab.label}
      </Text>
      {/* THE CORNER ORNAMENTS SIT ONE `field` OFF THE CELL'S OWN CORNER, not flush in it (side-eye
          2026-08-16 #94). The rail is full-bleed by ruling (§5.2 — it is the pane's floor and reaches its
          edges), so the LAST cell's inline-end edge IS the pane's edge: at a 1280px desktop the Map cell's
          lock glyph MEASURED at x 1268..1280, ending exactly on the viewport edge with zero gutter, reading
          as a clipped glyph rather than a lock. The gutter is bought INSIDE the cell so the full-bleed ruling
          stands and every cell's ornament reads the same. LOGICAL (`end-*`), never `right-*` — an ornament
          pinned to a physical side flips to the wrong corner in RTL. Spelled as a whole literal at each site
          (not hoisted to a const) because `ui-size-via-variant` reads these class strings statically, and a
          template hole would hide the sibling `size-1.5` from its allowlist. */}
      {locked ? <Icon icon={Lock} size="xs" aria-hidden={true} className="absolute end-field top-field text-muted-foreground" /> : null}
      {locked || isActive ? null : <RpgHudCellBadge count={count} dot={tab.badge === true} />}
    </TabsTab>
  );
}

function RpgHudCellBadge({ count, dot }: { readonly count: number; readonly dot: boolean }): ReactElement | null {
  if (count > 0) {
    return (
      <Badge intent="primary" size="sm" aria-hidden={true} className="absolute end-field top-field">
        {count}
      </Badge>
    );
  }
  // The boolean form is the same primitive with no content — a features-tier surface never paints a raw
  // element, so the dot is a childless `Badge` sized down, not a styled `<span>`.
  return dot ? <Badge intent="primary" size="sm" aria-hidden={true} className="absolute end-field top-field size-1.5 rounded-full p-0" /> : null;
}
