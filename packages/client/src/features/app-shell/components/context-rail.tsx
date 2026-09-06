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
import { ChevronLeft, ChevronRight, Icon, Lock } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { TabsList, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import type { ReactElement, RefObject } from "react";
import { useRef, useSyncExternalStore } from "react";
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

/** THE OWNERSHIP TREATMENT (half of the F6 defect-1 fix; re-ruled twice — #861, then #875 F2).
 *
 *  THE FILL IS THE MOCK'S, MEASURED IN PIXEL SPACE (owner-ruled 2026-08-30; retuned 2026-08-30 late after
 *  side-eye #875 F2 decoded the framebuffer). The owning rail wears `surface-raised` — the artboards' own
 *  `--raised: oklch(0.185 …)`, which IS this token — and the receded rail wears NOTHING, exactly as
 *  `ChatRoom.dc.html` draws it (`.rail.own { background: var(--raised) }`, no `.rail.recede` fill).
 *
 *  THAT IS A SMALL STEP AND IT IS DECLARED, NOT DISCOVERED: `surface-raised` over the pane's `sidebar`
 *  composites to ~1.077:1 in dark and ~1.024:1 in light. Those are the CEILING, not a target — the previous
 *  spelling (`bg-sidebar-accent/40` over `/15`) claimed the ownership axis was carried by the fill and
 *  measured 1.045:1 vs 1.001:1, i.e. it was never carrying it. Inflating the fill past the artboard was
 *  refused (the owner approved the mock); so the record is amended instead. WHAT ACTUALLY CARRIES THE
 *  OWNERSHIP AXIS, and what #861's fix should be credited to: the KICKER VOICE (below — the owning rail's
 *  name lifts toward the foreground while the receded one holds a quieter muted step), the `pb-row` FLOOR
 *  under the receded cells (so nothing ends on the pane's edge — the "dangling section header" read #861
 *  filed), the foot rail's top HAIRLINE, and the ember active state which only the owning rail can wear.
 *  Stated as ONE map per axis so the two states can never be tuned apart, and pinned by a framebuffer
 *  decode (`context-bracket.ct.tsx` — band == owning above receded == pane) so a future alpha tweak that
 *  vanishes on screen cannot pass as a fix again. */
const RAIL_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "bg-surface-raised",
  receded: "",
};
/** The mock's cells (`ChatRoom.dc.html`): a resting cell is the muted step on BOTH rails and only the
 *  ACTIVE cell lifts to the foreground — the owning rail is told apart by its fill and its kicker's
 *  selection half, not by brightening every caption; the receded rail's cells step quieter (its
 *  `opacity: .85`).
 *
 *  THE STEP IS FLOORED BY WCAG, NOT BY TASTE (#875 F1/F2, 2026-08-30). These captions are the pane's
 *  primary navigation on a LIVE control, so 1.4.3 applies at 4.5:1 with no disabled exemption anywhere in
 *  this rail. The old `/70` measured 4.65:1 in dark and **3.39:1 in light** — a real, unmeasured failure,
 *  because the light theme's `muted-foreground` carries only ~6.8:1 of headroom over the sidebar and an
 *  alpha eats it. `/90` is the quietest step that clears the floor in BOTH polarities (~7.2 dark, ~5.3
 *  light). The recede a reader actually sees is the fill + the kicker, not this. */
const CELL_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "",
  receded: "text-muted-foreground/90",
};
/** THE KICKER IS WHERE THE OWNERSHIP AXIS IS DECIDED (#875 F2 — "the ruling survives, its INPUT changed").
 *
 *  #861 filed the receded kicker as BRIGHTER than the owning one (8.50 vs 4.97); the first fix inverted the
 *  ink alpha and left the order still inverted (8.25 vs 8.03) because contrast is measured against each
 *  rail's OWN backdrop, and the receded rail's backdrop is the darker one. An ink alpha alone cannot win
 *  that in a dark theme, so the OWNING kicker lifts instead: its name steps toward the foreground while the
 *  receded rail's holds the muted ink one alpha down. Measured composited (framebuffer decode, both
 *  themes): owning ~10.7 dark / ~8.1 light vs receded ~7.2 dark / ~5.3 light — ordered, and both above the
 *  4.5:1 floor, which the old receded `/70` was not in light (3.25:1).
 *
 *  #102's AXIS SURVIVES, ITS INPUT CHANGED: the kicker's NAME half and its SELECTION half are still told
 *  apart by COLOUR (the mock's `.kick .sel`) — the selection stays at the full foreground and the name now
 *  sits one alpha under it rather than at the muted step. A narrower delta than the artboard's, and the
 *  cost of putting the ownership axis where it can actually be measured. */
const KICKER_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "text-foreground/80",
  receded: "text-muted-foreground/90",
};

/** THE CROWN INHERITS THE RECEDE (side-eye 08-01). Crown gold marks a host-only cell, but painted as an
 *  absolute `text-accolade` a RECEDED rail's brightest pixel was its crown. The gold is a treatment WITHIN
 *  a rail's own voice, so it steps with that voice: full gold while the rail owns, the cell's inherited
 *  (muted) colour while it recedes. */
const CROWN_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "text-accolade",
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

/** THE SCROLL HAS TO SAY IT IS A SCROLL (#875 F7/F8, side-eye 2026-08-30). `RAIL_TRACK_CLASSES` degrades an
 *  over-long rail to a scroll rather than an ellipsis, and `RAIL_WRAP_CELLS` folds only a rail that folds
 *  EVENLY — both correct, and together they left the case nothing answered: a five-cell rail at 1024×768
 *  (`scrollWidth 316` vs `clientWidth 290`) painted "Acti" cut at the pane's edge with no ellipsis, no
 *  scrollbar and no fade. That is the [[count-gate-standing-in-for-fit]] shape one level up: the FOLD is
 *  count-gated (right) and nothing measured the FIT.
 *
 *  So the fit is measured, in the only place it can be — the live box — and the overflowing edge wears a
 *  fade. Not a permanent fade (it would veil the last caption of every rail that fits) and not an
 *  always-on scrollbar (it would spend a row of height on every pane at every width): a `ResizeObserver` +
 *  a passive scroll listener write `data-overflow-start`/`data-overflow-end` on the rail, and the fades key
 *  off those. The attributes are the CT's handle as well as the paint's. */
const RAIL_FADE_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "from-surface-raised",
  receded: "from-sidebar",
};

/** Which edges of a horizontally scrolling track are hiding content right now. `scrollLeft` is signed in a
 *  RTL writing mode, so the START test is on its magnitude. */
function trackOverflow(track: HTMLElement): { readonly start: boolean; readonly end: boolean } {
  const travelled = Math.abs(track.scrollLeft);
  const total = track.scrollWidth - track.clientWidth;
  return { start: travelled > OVERFLOW_EPSILON_PX, end: total - travelled > OVERFLOW_EPSILON_PX };
}

const NO_OVERFLOW: { readonly start: boolean; readonly end: boolean } = { start: false, end: false };

/** The track's measured overflow, as an external-store subscription (ResizeObserver + scroll are the
 *  store; layout is the state's real owner, so `useSyncExternalStore` is the honest shape — the eslint
 *  no-external-store-subscription remedy, replacing the setState-in-effect this shipped as). The snapshot
 *  CACHES elementwise: a ResizeObserver fires on every layout pass that touches the track — the pane
 *  resizing, a scrollbar appearing, a modal opening over the shell — and a fresh object each time
 *  re-renders the whole rail for a value that did not change (MEASURED: that churn raced the command
 *  palette's focus restore and flaked `app-shell.ct.tsx`). `cellCount` keys the subscribe so a new tab
 *  set re-subscribes and re-measures; every other input arrives through the observer, which is why
 *  nothing else is enumerated. */
function useTrackOverflow(trackRef: RefObject<HTMLDivElement | null>, cellCount: number): { readonly start: boolean; readonly end: boolean } {
  const cache = useRef(NO_OVERFLOW);
  // The Compiler memoizes both closures keyed on what they read (no-manual-memo, D54 full-compile):
  // `subscribe` reads `cellCount`, so a new tab set mints a new subscribe and uSES re-subscribes + re-measures.
  const subscribe = (onStoreChange: () => void): (() => void) => {
    void cellCount;
    const track = trackRef.current;
    if (track === null) {
      return (): void => undefined;
    }
    const observer = new ResizeObserver(onStoreChange);
    observer.observe(track);
    track.addEventListener("scroll", onStoreChange, { passive: true });
    return (): void => {
      observer.disconnect();
      track.removeEventListener("scroll", onStoreChange);
    };
  };
  const getSnapshot = (): { readonly start: boolean; readonly end: boolean } => {
    const track = trackRef.current;
    const next = track === null ? NO_OVERFLOW : trackOverflow(track);
    const previous = cache.current;
    if (previous.start !== next.start || previous.end !== next.end) {
      cache.current = next;
    }
    return cache.current;
  };
  return useSyncExternalStore(subscribe, getSnapshot, (): { readonly start: boolean; readonly end: boolean } => NO_OVERFLOW);
}

/** Sub-pixel track widths are routine (a fractional container width divided into `1fr` tracks), so the fit
 *  test needs a tolerance or every rail claims to overflow by 0.4px. */
const OVERFLOW_EPSILON_PX = 1;

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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cellCount = tabs.length;
  const overflow = useTrackOverflow(trackRef, cellCount);

  return (
    <Stack
      data-slot="context-rail"
      data-owns={owns}
      data-edge={edge}
      data-overflow-start={overflow.start}
      data-overflow-end={overflow.end}
      className={`min-w-0 shrink-0 ${RAIL_OWNERSHIP_CLASSES[ownership]}`}
    >
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
      <Row align="center" gap="row" className="relative min-w-0 px-row pt-field pb-row">
        <TabsList
          ref={trackRef}
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
          <>
            {/* THE TRAIL IS NOT A SEVENTH CELL (#878 F17), AND SEPARATING IT COSTS THE TRACK NOTHING
                (#897, post-fix verification 2026-08-30 — the first spelling of this fix was the finding).
                The host's kebab ("Character actions", 34×34) sits INSIDE the rail's cell row with a glyph
                and no caption, beside captioned cells, in a rail whose law is "icon + caption, always"
                (#208) — so it read as a cell that forgot its word. It is not a cell and must not take a
                caption, so it is SEPARATED instead.
                THE RULE IS ABSOLUTELY POSITIONED, and that is the whole correction. Shipped as a flex
                CHILD with two `ms-row` insets it cost the cell track ~19px — and MEASURED at 1280 docked
                the six-cell Characters rail needs exactly that: `scrollWidth 319 / clientWidth 300`, with
                `Trust` painting as `Tru`. Every "spend less when it does not fit" rule is self-referential
                (stop spending → it fits → spend again), so the rule stops spending AT ALL: it paints in
                the flex `gap-row` that already separated these two children before this mark existed, so
                the track's budget is byte-identical to the pre-F17 geometry. `aria-hidden`: it is a rule,
                not a control. */}
            <Row align="center" className="relative shrink-0">
              {/* No call-site `w-px`: `orientation="vertical"` IS `h-full w-px` on the primitive
                  (separator/variants.ts), so the class was a redundant restatement of the seal — and it was
                  invisible to `ui-size-via-variant` only because this FILE carried a whole-file ALLOWLIST
                  row for the dot below, whose reason never mentioned it. Retiring that row (#1799) surfaced
                  it; dropping it is a no-op on the rendered rule. `inset-y-row` is the deliberate part. */}
              <Separator orientation="vertical" aria-hidden={true} className="-start-tight absolute inset-y-row" />
              {actions}
            </Row>
          </>
        ) : null}
        {/* The overflow marks. Purely presentational and never in the way of a tap — a `Stack` because a
            feature does not paint a raw element, `aria-hidden` because the fact they carry is already true
            of the scroll container an AT reader drives with the arrow keys.

            A GRADIENT ALONE WAS CORRECT AND UNREADABLE (#899 N9, post-fix verification 2026-08-30). It
            fired exactly when the rail overflowed and it was a real 30×71 element — but it fades the rail's
            OWN fill into transparent, so by construction it has almost no contrast against the thing it
            sits on, and the first read at both firing sites was still a chopped word (`Acti` at the reading
            preset, `Tru` at 1280 Characters): 30px of pane-coloured gradient reads as "the panel's edge",
            not as "there is more". So each mark now carries a CHEVRON — an inked glyph pointing the way the
            hidden cells lie, which is a mark a reader can recognise and an instrument can measure (its
            contrast against the rail fill is pinned in `context-bracket.ct.tsx`; a gradient's could never
            be). The fade widens with it, so the chevron sits on ground the caption has already left. */}
        {overflow.start ? (
          <Stack
            align="center"
            justify="center"
            aria-hidden={true}
            data-slot="context-rail-fade"
            data-edge="start"
            className={`pointer-events-none absolute inset-y-0 start-0 w-gutter bg-linear-to-r ${RAIL_FADE_CLASSES[ownership]} via-60% to-transparent`}
          >
            <Stack data-slot="context-rail-more" className="text-muted-foreground">
              <Icon icon={ChevronLeft} size="xs" />
            </Stack>
          </Stack>
        ) : null}
        {overflow.end ? (
          <Stack
            align="center"
            justify="center"
            aria-hidden={true}
            data-slot="context-rail-fade"
            data-edge="end"
            className={`pointer-events-none absolute inset-y-0 end-0 w-gutter bg-linear-to-l ${RAIL_FADE_CLASSES[ownership]} via-60% to-transparent`}
          >
            <Stack data-slot="context-rail-more" className="text-muted-foreground">
              <Icon icon={ChevronRight} size="xs" />
            </Stack>
          </Stack>
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
 *  PHASE-locked (the Map): a LOCK glyph + the reason on `title` — deliberately NOT `aria-disabled`: the
 *  locked cell OPENS onto a body that states when the feature arrives (RV-7), and a control announcing
 *  "unavailable" while Enter opens it is two stories. One story, in every pane: a real cell wearing a lock,
 *  where mouse, keyboard and AT all get the same answer.
 *
 *  AND THE DIM OBEYS THAT SAME STORY (#874, side-eye 2026-08-30 — the one WCAG failure in the bracket).
 *  The mock's `.cell.lock { opacity: 0.6 }` was taken literally onto the cell ROOT, which put the caption
 *  at **3.54:1** against a sibling's 7.59:1 — and because this cell renounces `aria-disabled`, 1.4.3's
 *  disabled exemption does not apply to it. (axe scored it 100: it does not composite ancestor `opacity`,
 *  so it read the undimmed ink. The green was a blind spot, not a clearance.) The dim now lands on the
 *  ORNAMENTS — the glyph and the padlock, non-text content — and the CAPTION keeps the rail's own ink, so
 *  the "unavailable" signal is carried by the lock, which is the thing that means it. */
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
      className={`relative data-active:bg-primary/15 data-active:text-foreground ${CELL_EDGE_CLASSES} ${CELL_OWNERSHIP_CLASSES[ownership]} ${CONTEXT_CELL_FLOOR_AT_COARSE}`}
      {...(tab.disabledReason !== null ? { title: tab.disabledReason } : {})}
    >
      {tab.icon !== undefined ? (
        <Icon icon={tab.icon} size="sm" className={`${crowned ? CROWN_OWNERSHIP_CLASSES[ownership] : ""} ${locked ? "opacity-60" : ""}`} />
      ) : null}
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
      {locked ? <Icon icon={Lock} size="xs" aria-hidden={true} className="absolute end-field top-field text-muted-foreground opacity-60" /> : null}
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
  // element, so the dot is a childless `Badge`, not a styled `<span>`. It rode `size="sm"` plus a
  // call-site `size-1.5 rounded-full p-0` for as long as Badge had no dot to give (the one live
  // `ui-size-via-variant` ALLOWLIST survivor); `size="dot"` is that shape as a VARIANT (#1798/#1799), so
  // the seal is intact here and the allowlist row is gone. Same rendered 6px circle — `size-field` is the
  // belt step `size-1.5` was spelling by hand.
  return dot ? <Badge intent="primary" size="dot" aria-hidden={true} className="absolute end-field top-field" /> : null;
}
