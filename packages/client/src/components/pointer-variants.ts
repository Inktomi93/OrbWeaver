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

/** The rpg item-icon picker's coarse gap: `gap-block` (12px) makes the tiled 32px cells' pitch exactly 44 so
 *  each cell's overflowing hit `::after` is not clipped by the wrap gap. Fine keeps the tighter `gap-field`.
 *  CT: tests/client/features/rpg/components/rpg-pack-rows.ct.tsx. */
export const PICKER_GAP_AT_COARSE = "pointer-coarse:gap-block";

/** The rpg HUD tab-rail's pointer-forked wrap: at FINE the narrow rail folds to rows of three (the `@max-xs`
 *  CONTAINER step, not a viewport query); at COARSE it stays ONE row and SCROLLS (`minmax(max-content,1fr)`
 *  tracks + `overflow-x-auto`) — the phone tab-strip idiom, so a phone spends 50px not 105px on the rail. The
 *  ≥44px cell floor itself is TabsTab's own sealed `min-w-touch-target`, not spelled here. CT: the rpg HUD
 *  rail geometry + tests/ui/primitives/tabs/tabs.ct.tsx. */
export const RPG_RAIL_WRAP =
  "pointer-fine:@max-xs:grid-flow-row pointer-fine:@max-xs:grid-cols-3 pointer-coarse:auto-cols-[minmax(max-content,1fr)] pointer-coarse:overflow-x-auto";
