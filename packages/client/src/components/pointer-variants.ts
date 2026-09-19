// Axis-3 pointer/hover CAPABILITY class fragments (UI-Architecture §4b) — the SHELL/SHARED-layer home for
// `pointer-coarse:`/`pointer-fine:` utility variants. Those variants are BANNED in features/** by
// `no-pointer-variants-in-features`, exactly as viewport width variants are by `no-media-queries-in-features`:
// pointer/hover are a device CAPABILITY a container query cannot see, so a feature COMPOSES a named fragment
// from here (or a pointer-conditional TOKEN like `min-w-touch-target`) instead of spelling the media variant
// inline. Behaviour is homed here so a coarse touch-floor or a fine-only reveal is retunable in ONE place.
// Each value below is the EXACT class it replaced in a feature — the relocation is byte-for-byte
// behaviour-preserving, and the coarse touch-floors it carries are CT-pinned (paths noted per fragment).

/** Drop an element entirely at a coarse pointer (`display:none`) — decoration/echo a phone-width column
 *  cannot afford. A DEVICE-class swap (never hover-keyed), so it cannot oscillate the way a hover `display`
 *  swap does (`no-hover-display-swap`). Distinct from {@link "./row-reveal.ts".ROW_ACTION_INLINE}: that names
 *  the inline arm of a collapsing control PAIR (its verb rides an overflow `MenuItem`); this is a plain drop
 *  with no coarse twin. Live: rpg HUD selection echo, rpg takeover satellites, the chat member-row cluster. */
export const HIDE_AT_COARSE = "pointer-coarse:hidden";

/** The COARSE-ONLY twin of {@link HIDE_AT_COARSE}: an element that exists only where the pointer is coarse.
 *
 *  Live: the chat control band's resting SUMMARY STRIP (#2426). On a phone that band is the transcript's
 *  biggest compounding tax — measured 127px at 430x740 in a game room, of which 115px is the chip row
 *  wrapping to three lines, against a 185px reading port — so at a coarse pointer the band's resting state
 *  is ONE row: the disclosure alone, with the chips behind it. The disclosure therefore has to exist in
 *  arms where a fine pointer needs none (a row under the display cap discloses nothing there), which is
 *  what this fragment buys; the chips take {@link HIDE_AT_COARSE} in the same arm.
 *
 *  `display: none`, so the element it hides is out of the a11y tree as well as out of layout — correct for
 *  an alternative spelling of a control that exists in both arms, never for a label whose spoken job
 *  survives its sighted one ({@link LABEL_TO_SR_ONLY_AT_COARSE} is that case). CT:
 *  tests/client/features/chat/components/chat-controls-band.ct.tsx. */
export const SHOW_ONLY_AT_COARSE = "pointer-fine:hidden";

/** Collapse a LABEL to the accessibility tree at a coarse pointer — it stops spending layout, and stays
 *  announced. The distinction from {@link HIDE_AT_COARSE} is the whole point and is not stylistic:
 *  `hidden` is `display:none`, which removes the text from the a11y tree as well as the row, so it is
 *  correct only for decoration/echo. This one is for a label whose SIGHTED job is taken over by an adjacent
 *  glyph or avatar on a phone while its SPOKEN job is not taken over by anything.
 *
 *  Live: the chat character strip's member names (#511) — a crowded roster wrapped that strip to 5 rows / 160px
 *  at 320px, and the wrap tax GREW as the screen narrowed, all of it taken from the transcript. Collapsed,
 *  the strip is one 40px row at every width and every roster size, and a screen-reader user still hears the
 *  whole set of names. CT: tests/client/features/chat/components/chat-character-bar.ct.tsx. */
export const LABEL_TO_SR_ONLY_AT_COARSE = "pointer-coarse:sr-only";

/** Reveal an opacity/pointer-events reveal cluster PERMANENTLY at a coarse pointer (there is no hover to
 *  reveal it there). Composed onto a hover/`:focus-within` reveal base so the cluster is always interactive on
 *  touch. Live: the message-actions reveal resolver. */
export const REVEAL_AT_COARSE = "pointer-coarse:opacity-100 pointer-coarse:pointer-events-auto";

/** A trailing cluster that OVERLAYS content and so must be inert at rest, live on hover/`:focus-within` —
 *  FINE pointers only (at coarse there is no hover and the cluster is permanently visible via `ROW_REVEAL`, so
 *  it must stay live). The wrapper carries it; `pointer-events` inherits to its children. `listRowVariants`'
 *  `float` arm is the ui-layer twin. Live: the persona panel-row action cluster. */
export const FINE_INERT_UNTIL_HOVER =
  "pointer-fine:pointer-events-none pointer-fine:group-hover:pointer-events-auto pointer-fine:group-focus-within:pointer-events-auto";

/** The rpg tracker chip's coarse touch floor: its FLOORLESS glyph ✕ rides an overflowing `::after` that a
 *  flex-wrap gap clips, so the CHIP takes the ≥44px min-height at coarse and the pseudo fits inside its own
 *  chip. Fine is untouched (a 30px chip in a dense tracker row). CT:
 *  tests/client/features/rpg/components/rpg-actor-trackers.ct.tsx. */
export const CHIP_TOUCH_FLOOR_AT_COARSE = "pointer-coarse:min-h-touch-target";

/** A GLYPH-ONLY CHIP's coarse touch floor on its NARROW axis (#875 F6, side-eye 2026-08-30). `Button`'s
 *  `sm` arm carries the 44px HEIGHT everywhere it matters, and an icon+word chip is wide by construction —
 *  but the same control with the word absent is only as wide as its glyph plus padding, and design-audit
 *  measured the chat context band's memory chip at **40×44** against the 44px short-side floor. The height
 *  floor ({@link CHIP_TOUCH_FLOOR_AT_COARSE}) cannot answer that; this is its inline twin, and the two are
 *  separate constants because a chip that is short and a chip that is narrow are different defects with
 *  different call sites. Fine is untouched (a 34px chip in a dense topbar row).
 *  CT: tests/client/features/chat/components/chat-recall-indicator.ct.tsx. */
export const CHIP_TOUCH_WIDTH_FLOOR_AT_COARSE = "pointer-coarse:min-w-touch-target";

/** A STACKED TEXT-HEIGHT VALUE ROW's coarse touch floor — the row, never the value (#869).
 *
 *  `TrackerValue`'s rest state is `Button size="inline"`: an ~18px text-height box whose 44px coarse target
 *  rides an overflowing `::after`, deliberately layout-neutral so the click-to-edit swap is pixel-stable.
 *  Two of those STACKED closer than 44px do not merely share a boundary — the LOWER one's pseudo, painted
 *  later, takes every pixel it overlaps, including the pixels the upper control PAINTS ITS DATUM ON.
 *  MEASURED at 430 coarse on the rpg Status card of a just-started game (status line above `+ condition`,
 *  `gap-field` between them): the status line's `—` owned `yExtent=23 xExtent=1` — one column of pixels —
 *  because `+ condition` is a full-width control whose 44x198 pseudo covers the row above it. Tapping the
 *  visible dash opened the ADD-CONDITION editor. (The #863 review filed this as an asymmetric pseudo; it is
 *  not — `top:50%` + `-translate-y-1/2` centres it exactly, and the 6.5/-37.5 inset pair is that centring
 *  read before the transform. The defect is PITCH, not asymmetry.)
 *
 *  The floor goes on the ROW (the chip precedent, {@link CHIP_TOUCH_FLOOR_AT_COARSE}), never on the value:
 *  a 44px rest button would break the no-shift ruling `tracker-value.tsx` states (the revealed input is
 *  `layout="inline"`, text-height at every pointer) and defeat the `inline` arm's whole contract. At
 *  `min-h-touch-target` the pseudo fits inside its own row and the neighbour keeps its datum. Fine is
 *  untouched (a 28px target on an 18px box overflows 5px into a 6px gap — it never reaches the neighbour).
 *  CT: tests/client/features/rpg/lib/rpg-context-section.ct.tsx ("the coarse tap on a visible datum"). */
export const VALUE_ROW_TOUCH_FLOOR_AT_COARSE = "pointer-coarse:min-h-touch-target";

/** A TEXT-HEIGHT DISCLOSURE TRIGGER's coarse touch floor. `CollapsibleTrigger` is `inline-flex` with no
 *  control box (it is a line of prose that toggles), so unlike `Button`'s `inline`/`glyph-*` arms it carries
 *  NO hit-area `::after` at all — MEASURED at 430×740 DPR3 `pointer:coarse`, the rpg turn-tool-calls trigger
 *  was a 406×16 box whose centre `elementFromPoint` could not even resolve to it. A full-bleed row trigger
 *  has width to spare and only wants HEIGHT, so the floor goes on the trigger's own box (no overflowing
 *  pseudo to collide with the rows above/below, which is the failure mode the chip floor below documents).
 *  Fine is untouched — a 16px line in a dense transcript footer. CT:
 *  tests/client/features/rpg/components/turn-tool-calls-disclosure.ct.tsx. */
export const DISCLOSURE_TOUCH_FLOOR_AT_COARSE = "pointer-coarse:min-h-touch-target";

/** The rpg item-icon picker's coarse gap: `gap-block` (12px) makes the tiled 32px cells' pitch exactly 44 so
 *  each cell's overflowing hit `::after` is not clipped by the wrap gap. Fine keeps the tighter `gap-field`.
 *  CT: tests/client/features/rpg/components/rpg-pack-rows.ct.tsx. */
export const PICKER_GAP_AT_COARSE = "pointer-coarse:gap-block";

/** The context bracket rail's narrow-panel FOLD (born as the rpg HUD rail's, universal since #860): at a
 *  FINE pointer below the `xs` CONTAINER step (never a viewport query) a LONG rail lays out as rows of three
 *  instead of one squeezed row, which buys each caption ~85px and keeps every word whole. At a COARSE
 *  pointer it does not fire at all — a phone stays ONE row and scrolls (the phone tab-strip idiom: 50px of
 *  rail, not 105px). The rail's caller decides WHICH rails are long enough to be worth a second row; the
 *  ≥44px cell width floor is `TabsTab`'s own sealed `min-w-touch-target`, not spelled here. CT:
 *  tests/client/features/rpg/lib/rpg-context-section.ct.tsx.
 *
 *  THIS CONSTANT USED TO CARRY THE NO-CLIP TRACK SIZING TOO, and that is exactly what broke (#208,
 *  2026-08-18). It bundled the fold with `minmax(max-content,1fr)` + `overflow-x-auto` under one
 *  count-gated application, so a rail SHORT enough to skip the fold also skipped the guarantee that a
 *  caption never shrinks below its own word — and fell back to a bare `auto-cols-fr`, whose only
 *  degradation is an ellipsis. MEASURED at the panel's 272px floor once the Members tab made the chat rail
 *  four cells: 51px a cell against a 58px "Members" and a 54px "This chat", both clipped. The track sizing
 *  is a property of EVERY rail at EVERY width and is now declared as one, unconditionally, at the rail
 *  (`RAIL_TRACK_CLASSES` in app-shell's context-rail.tsx); this constant is the fold and nothing else. In
 *  the folded arm the explicit `grid-cols-3` sizes the columns, so the two declarations compose. */
export const CONTEXT_RAIL_WRAP = "pointer-fine:@max-xs:grid-flow-row pointer-fine:@max-xs:grid-cols-3";

/** The context rail cell's active EDGE BAR, stood down in exactly the state that makes it lie (side-eye
 *  #102, 2026-08-17). The bar sits on the cell's bottom edge — for the state rail, the seam with the
 *  viewport it selects — which is true only while the rail is ONE row. In {@link CONTEXT_RAIL_WRAP}'s
 *  `@max-xs` fine arm the six cells fold to two rows of three, and MEASURED at the panel's 272px floor the
 *  active first-row cell painted its 2px primary bar along the seam between row one and row two: the
 *  marker pointed at the cell BELOW it, not at the content it selects. The bar is suppressed to
 *  `transparent` rather than removed, so the 2px border box stays and no cell changes height when the rail
 *  folds; the active treatment in the wrapped state is the cell's own fill + ink, a WHOLE-cell mark with no
 *  direction to be wrong about. The coarse arm is untouched — there the rail stays one row and scrolls.
 *  Pointer-keyed, so it is homed here and not in the feature (`no-pointer-variants-in-features`).
 *  CT: tests/client/features/rpg/lib/rpg-context-section.ct.tsx. */
export const CONTEXT_RAIL_WRAPPED_EDGE_BAR_OFF = "pointer-fine:@max-xs:data-active:border-transparent";

/** The context rail CELL's coarse HEIGHT floor (#860 — the mock's phone arms draw 52px cells; the first
 *  token step at or above that is `control-lg`, 56px at a coarse pointer). `TabsTab`'s `stacked` arm seals
 *  `min-h-control-sm` (44px coarse), the D62 P1 floor for any control; a rail cell on a phone is the pane's
 *  PRIMARY navigation under a thumb and takes the taller step. Fine pointers are untouched (the seal's
 *  32px, under a content-sized two-line cell). CT: tests/client/features/app-shell/components/context-tabs-panel.ct.tsx. */
export const CONTEXT_CELL_FLOOR_AT_COARSE = "pointer-coarse:min-h-control-lg";

/** The persona PIN's faint reveal (#866 S4, pin-not-crown — `persona-pin.tsx`, both its mounts): the
 *  click-to-pin verb is secondary chrome, rest-invisible at a fine pointer and revealed FAINT on the
 *  row's hover/focus-within; at coarse (no hover exists) it is ALWAYS faint — an invisible control would
 *  be an unreachable one, and the row budgets its touch box for it. Opacity only (the `ROW_REVEAL` law —
 *  display/visibility swaps under a hover key are hit-test oscillators), keyed on the row's `group` like
 *  the action cluster; direct hover/focus restore full strength so nobody aims at a 40%-opacity target.
 *  Pointer-keyed, so it is homed here and not in the feature (`no-pointer-variants-in-features`).
 *  CT: tests/client/features/persona/components/persona-panel-row.ct.tsx (the pin arms). */
export const PIN_REVEAL =
  "opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover:opacity-60 group-focus-within:opacity-60 hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-40";
