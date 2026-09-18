import { DISABLED_STATE, FOCUS_RING, SELECTION_RING_CHECKED, tv } from "#lib";

// picker-cell — the ONE cell anatomy every single-choice PICTURE picker in this app wears (#929 E6).
//
// WHY IT EXISTS (the measured defect, re-drive #1099 E6): five picker families disagreed about what a
// choice-you-look-at is — theme cards at 828.8x66 full-width slabs, chat-style cards at 270.9x117 and
// 270.9x130 with a last row of 410.4x117, elevation at 271x76, density at 114x34 over 90x34, background
// at 103.6 square. Same job, five geometries, and three of the five were flex-wrap pretending to be a
// grid, which is exactly why the last row stretched 139px wider than the rows above it (F27).
//
// THE FRAME IS PRESENTATION ONLY. It owns the box, the art aperture, the footer and the selected/focus
// paint; it owns NO model knowledge and NO interaction. The art is FEATURE-SUPPLIED (a chat-style mini
// transcript, an elevation diagram, a density stack, a theme mini surface) — the cell never knows what a
// theme or a skin is. The interaction is supplied by the HOST: `RadioGroupPickerItem` renders a Base UI
// `Radio.Root` AS this frame through Base UI's own `render` prop, so one element carries both the ARIA
// composite semantics and this skin (#981), and a non-interactive mount (a menu row's preview) renders
// the same frame with nothing wired.
//
// GEOMETRY IS STABLE ACROSS STATES (the owner's zero-shift bar). Selection is a 2px INSET ring plus the
// check — never a fill, never a glow, never a border-width change; focus is the shared offset ring. Both
// paint inside the existing box, so hover/focus/selection cannot move a neighbour.
export const pickerCellVariants = tv({
  slots: {
    // THE GRID IS A REAL GRID (F27). The five picker families were `flex flex-wrap` with `flex-1` children,
    // so the last row's survivors stretched to fill it — measured 410.4px cards under 270.9px cards in one
    // grid. Explicit column tracks give every cell in every row the same width by construction.
    //
    // THE STEPS ARE CONTAINER QUERIES, NOT AN AUTO-FIT TRACK. `repeat(auto-fit, minmax(…))` would be the
    // natural spelling and it is NOT available here: grid track TEMPLATES are homed once, in the layout
    // kit, and `primitives/` sits BELOW the composed groups (dep-cruiser `ui-primitives-below-groups`)
    // while `content/` may not reach sideways either (`ui-groups-independent`) — so a picker that spelled
    // its own `minmax()` would be a second home for a ratified track set AND an off-token bracket
    // (`no-arbitrary-tw-values` / `css-length-tokens`). Container steps answer the same question with
    // token-scale utilities: the picker widens with the PANE it sits in, not the viewport.
    //
    // NO `@container` ANCESTOR ⇒ ONE COLUMN, which is the honest degradation (a cell is never squeezed by
    // a step that cannot be evaluated). Every config mount has one: `SettingRowGroup` wraps its rows in
    // `<Container>`.
    grid: "grid grid-cols-1 items-stretch gap-row @sm:grid-cols-2 @lg:grid-cols-3",
    // `items-stretch` + `h-full` is the equal-height half of F27: an auto-fit grid gives equal WIDTHS, and
    // a cell that fills its row track gives equal HEIGHTS even when one gloss wraps to two lines.
    // `@container` (inline-size containment) makes the frame a query container so the art aperture can
    // derive its height from the frame's content-box width via `cqw` and pixel-snap it with CSS `round()`
    // (#1836): `aspect-ratio` produces fractional heights from non-integer widths (a third of a container
    // minus gaps is always a runtime fraction), and every later section on the same scrollable pane
    // INHERITS the sub-pixel offset. The declared `round(nearest, …, 1px)` length is what CSS can round.
    frame: [
      "@container relative flex h-full min-w-0 flex-col gap-field overflow-hidden rounded-control border border-border bg-card p-field text-left outline-none",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "hover:border-ring",
      FOCUS_RING,
      // THE RING IS THE SHARED FRAGMENT (#1840): `SELECTION_RING_CHECKED` is the app-wide selected-CELL
      // idiom's one spelling, beside `SELECTION_RAIL`'s row half — this cell was its reference carrier and
      // `MediaGrid` now paints the same two declarations instead of its own four layers. `ring-inset` keeps
      // the ring INSIDE the border box (a 2px outset ring grows the cell's painted footprint and nudges its
      // neighbours on every pick); the primary BORDER stays this frame's own, because only this cell has
      // one to recolour.
      `data-checked:border-primary ${SELECTION_RING_CHECKED}`,
      DISABLED_STATE,
    ],
    // The art APERTURE: a fixed aspect box, so every cell in a grid reserves the same picture area before
    // its art has computed anything. `bg-background` is the ground a feature's art draws on — the same
    // surface the real thing paints on, so a diagram is never floating on the card tone.
    //
    // Height is an EXPLICIT `round()` length, NOT `aspect-ratio` (#1836): the frame is `@container`
    // (inline-size), so `100cqw` = the frame's content-box width = the art's own width (it is `w-full`).
    // `round(nearest, 100cqw * <ratio>, 1px)` pixel-snaps the height that `aspect-ratio` left fractional.
    // The variant `shape` sets the height; `w-full` sets the width; the combination replaces aspect-ratio.
    art: "pointer-events-none relative w-full shrink-0 select-none overflow-hidden rounded-inset bg-background",
    // The FOOTER is reserved whether or not a description exists — the reason two cards in one row used to
    // differ by 13px of height.
    body: "flex min-w-0 flex-1 flex-col gap-tight",
    titleRow: "flex min-w-0 items-center justify-between gap-field",
    label: "min-w-0 truncate",
    meta: "shrink-0",
    // 13px, muted — NOT `voice="gloss"` (10.5px). `undersized-ui-text` fired 8x of 16 judged on the
    // chat-style cards' glosses (#1099 F31): copy inside an interactive cell is read at the control's
    // register, so it takes the label step and carries its quiet only in tone.
    description: "min-w-0",
    // The check rides the frame's top-trailing corner, over the art, out of the footer's flow.
    check: "absolute top-field right-field flex items-center justify-center rounded-full bg-primary p-tight text-primary-foreground",
  },
  variants: {
    /** The art aperture's shape — the ONE thing a picker family gets to choose about the cell's geometry. */
    shape: {
      /** A wide picture: a transcript, a shell diagram, a spacing stack, a palette.
       *  16:9 → height = width * 9/16 = width * 0.5625, pixel-snapped. */
      // @orb-waive css-length-tokens(1px): the `1px` is the CSS `round()` rounding precision, not a design token — a structural mechanic, not a size; ends when round() accepts a token
      landscape: { art: "h-[calc(round(nearest,100cqw*0.5625,1px))]" },
      /** A square picture: a wallpaper thumbnail, an avatar shape.
       *  1:1 → height = width, pixel-snapped. */
      // @orb-waive css-length-tokens(1px): same structural pixel-snap precision as landscape above
      square: { art: "h-[calc(round(nearest,100cqw,1px))]" },
      /** No picture at all — a label-only cell that must still sit in the same grid as its picture siblings. */
      none: { art: "hidden" },
    },
  },
  defaultVariants: { shape: "landscape" },
});
