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

/** The rpg HUD tab-rail's pointer-forked wrap: at FINE the narrow rail folds to rows of three (the `@max-xs`
 *  CONTAINER step, not a viewport query); at COARSE it stays ONE row and SCROLLS (`minmax(max-content,1fr)`
 *  tracks + `overflow-x-auto`) — the phone tab-strip idiom, so a phone spends 50px not 105px on the rail. The
 *  ≥44px cell floor itself is TabsTab's own sealed `min-w-touch-target`, not spelled here. CT: the rpg HUD
 *  rail geometry + tests/ui/primitives/tabs/tabs.ct.tsx.
 *
 *  THE FINE ARM HAD A HOLE BETWEEN ITS TWO ANSWERS (side-eye 2026-08-16 #94, MEASURED at a 1280px desktop:
 *  game rail 383px wide, six `auto-cols-fr` cells at 59px each, "Inventory" caption scrollWidth 48 vs
 *  clientWidth 47 ⇒ rendered "Invento…"). Below the `xs` container step the row-wrap arm fires and every
 *  caption is whole; at coarse the `minmax(max-content,1fr)` arm fires and the row scrolls rather than
 *  clipping. Between them — a FINE pointer at or above `xs`, which is every docked desktop panel, i.e. the
 *  most common mount in the product — neither fired and the bare `auto-cols-fr` clipped. The fix is not a
 *  third behaviour: it is the SAME track-sizing function the coarse arm already proves correct, applied to
 *  the fine range the row-wrap does not cover (`pointer-fine:@xs:`). `minmax(max-content, 1fr)`'s `1fr` max
 *  keeps the cells equal and the rail full whenever there is slack (unchanged on a wide pane), and its
 *  `max-content` min refuses to shrink a caption — where six no longer fit the tracks overflow and
 *  `overflow-x-auto` scrolls them. Degrade to scrolling, never into an ellipsis; the two arms cannot be
 *  tuned apart because they are now the same declaration. */
export const RPG_RAIL_WRAP =
  "pointer-fine:@max-xs:grid-flow-row pointer-fine:@max-xs:grid-cols-3 pointer-fine:@xs:auto-cols-[minmax(max-content,1fr)] pointer-fine:@xs:overflow-x-auto pointer-coarse:auto-cols-[minmax(max-content,1fr)] pointer-coarse:overflow-x-auto";

/** The rpg HUD rail cell's active EDGE BAR, stood down in exactly the state that makes it lie (side-eye
 *  #102, 2026-08-17). The bar faces INWARD toward the viewport — the game rail marks its bottom edge — which
 *  is true only while the rail is ONE row. In {@link RPG_RAIL_WRAP}'s `@max-xs` fine arm the six cells fold
 *  to two rows of three, and MEASURED at the panel's 272px floor the active first-row cell painted its 2px
 *  primary bar along the seam between row one and row two: the marker pointed at the cell BELOW it, not at
 *  the content it selects. The bar is suppressed to `transparent` rather than removed, so the 2px border
 *  box stays and no cell changes height when the rail folds; the active treatment in the wrapped state is
 *  the cell's own fill + accent ink, which is a WHOLE-cell mark with no direction to be wrong about. The
 *  coarse arm is untouched — there the rail stays one row and scrolls, so the bar still points at the
 *  viewport. Pointer-keyed, so it is homed here and not in the feature (`no-pointer-variants-in-features`).
 *  CT: tests/client/features/rpg/lib/rpg-context-section.ct.tsx. */
export const RPG_RAIL_WRAPPED_EDGE_BAR_OFF = "pointer-fine:@max-xs:data-active:border-transparent";
