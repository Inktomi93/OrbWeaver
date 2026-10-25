import { DISABLED_STATE, FOCUS_RING, FOCUS_RING_INSET, GROUND, tv } from "#lib";

// The tabs skin (D62 UIP-307) — an UNDERLINE strip, not a segmented pill: the list is a plain row
// with a hairline `--color-border` track along its bottom edge; the active marker is a 2px `--primary`
// bar that slides along that edge. Tabs sit above the indicator via z-(--z-raised).
// `orientation="vertical"` (Base UI mirrors `data-orientation`
// onto every part) is the one CSS branch: root/list flip from a stack to a side-by-side row, and the
// list stacks its tabs in a column. Tabs ride h-(--size-control-sm) (the ≥44px touch floor, §4b axis 3) in the
// default `inline` layout; the `stacked` arm trades the fixed height for content height + a min-height
// floor (see the variant's own note). The --active-tab-* vars the indicator reads are recomputed by
// Base UI for the vertical axis; the underline reads `left`/`width` (recomputed there too), so it
// needs no orientation branch. `border`/`h-(--border-width-accent)` are Tailwind's untokenized hairline scale (the
// `border border-border` precedent) — a 1px track + a 2px bar aren't worth a token each.
export const tabsVariants = tv({
  slots: {
    root: "flex flex-col gap-block inline-full data-[orientation=vertical]:flex-row",
    list: [
      "relative inline-flex items-center gap-block border-be border-border inline-fit",
      "data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
    ],
    tab: [
      `
        relative z-(--z-raised) inline-flex cursor-pointer items-center justify-center gap-field text-label leading-label font-medium whitespace-nowrap
        text-muted-foreground select-none
      `,
      "transition-colors duration-(--motion-fast) ease-out-expo hover:text-foreground",
      // The focus ring is per-LAYOUT (see the `layout` variant): a strip tab takes the offset ring every
      // control wears; a rail cell takes the INSET one, because its list can become a scroll box.
      "outline-none",
      "data-active:text-foreground",
      DISABLED_STATE,
      "data-[orientation=vertical]:justify-start",
    ],
    // The sliding underline — a 2px `--primary` bar pinned to the list's bottom edge, positioned from
    // Base UI's runtime --active-tab-left/width vars. rounded-full keeps the short bar's ends soft.
    //
    // The REST box is layout (`left`/`width`) and carries NO transform; the SLIDE is a transform-only
    // FLIP driven from `tabs.tsx` (`glideIndicator` — read its note for why the obvious
    // `translateX()`/`scaleX()` skin is illegal here). So the transition NAMES `transform` and nothing
    // else: it was `transition-all` on left/width until #1069, i.e. a layout animation on every tab
    // switch that the app's own `[anim]` flagger correctly convicted under guide §3.7. `origin-left`
    // pins the FLIP's scale to the bar's leading edge, which is where the left var measures from.
    indicator: [
      `
        absolute inset-s-(--active-tab-left) inset-be-0 z-(--z-raised) origin-left rounded-full bg-primary block-(--border-width-accent)
        inline-(--active-tab-width)
      `,
      "transition-[transform] duration-(--motion-base) ease-out-expo",
    ],
    // The panel is FOCUSABLE (Base UI gives it tabindex=0 so a keyboard user can reach its content by
    // Tab), so it needs a real focus ring: the UA's default outline measured 1.10:1 against the panel
    // background — under the 3:1 non-text-contrast law (2026-08-01 side-eye P1). It takes the INSET ring,
    // not the offset FOCUS_RING every control wears: a panel fills its container edge-to-edge (context
    // panels, the rpg HUD), so an outward `ring-offset-2` halo paints into — and is clipped by — the
    // scroll parent, i.e. the ring would be invisible exactly where the panel is used. Inset always paints.
    panel: ["text-body leading-body text-foreground inline-full", "outline-none", FOCUS_RING_INSET],
  },
  variants: {
    // THE TAB CELL'S ARRANGEMENT — and, with it, its height rule. `inline` is the strip tab: one row, the
    // fixed `h-(--size-control-sm)` chrome height. `stacked` is the HUD/rail cell: glyph OVER caption, so the height
    // must FOLLOW the content (`h-auto`) with `min-h-(--size-control-sm)` keeping the ≥44px coarse tap floor.
    //
    // This is a VARIANT and not a call-site `className` for a measured reason (the 2026-08-01 side-eye P0):
    // `h-auto` appended by a caller did NOT beat `h-(--size-control-sm)` — the custom spacing scale was unregistered
    // in tailwind-merge, both classes survived, and STYLESHEET ORDER decided (h-auto loses; `.h-auto` is
    // emitted before `.h-control-sm`). The rail's captions rendered as a 5px sliver. #146 registered the
    // scale, so the mechanism INVERTED: a call-site height now wins the merge outright. That does not undo
    // this ruling, it sharpens it — an unsealed size is now silently overridable by any caller, so the seal
    // is the variant plus the `ui-size-via-variant` gate, never a merge accident. A sealed size can only be
    // overridden HERE, the button `size="media"` precedent (F2).
    layout: {
      inline: { tab: `px-block block-(--size-control-sm) ${FOCUS_RING}` },
      // `min-w-(--size-touch-target)` is the WIDTH half of the same floor the height already carries, and it is
      // sealed here for the same reason (side-eye 2026-08-07 §① P2). The rpg rail put the cells on
      // `grid-auto-columns: max-content` at a coarse pointer and three of six came out 34-43px wide — a
      // 49px-tall cell you cannot reliably hit, with no `::after` hit pseudo to make up the difference the
      // way `Button`'s `glyph-*` arm does. The token is POINTER-CONDITIONAL (44px coarse / 28px fine), so
      // the floor is stated once, in the layer §4b axis 3 puts pointer capability in, and no consumer of
      // this arm can forget it. It is a MIN, so an equal-column rail with room to spare still stretches.
      //
      // AND THE FOCUS RING FORKS WITH THE ARRANGEMENT, for the reason the `panel` slot above already states
      // one component over. A `stacked` cell is a RAIL cell, and a rail that has to fit more cells than its
      // width affords becomes an `overflow-x-auto` box — which forces `overflow-y` to `auto` too (CSS
      // computes a `visible` axis to `auto` when the other axis is not visible), while the list's client box
      // is exactly one cell tall with no padding. `FOCUS_RING`'s `ring-offset-2` paints 4px OUTSIDE the
      // cell's border box, i.e. entirely inside the clipped region: MEASURED by a real Tab traversal at 430
      // coarse, the focused cell's computed box-shadow was a non-inset 4px ring with 0px of headroom in a
      // non-`visible` overflow box — a keyboard indicator nobody can see. Paying for it with 4px of rail
      // padding was the other arm and was refused: the 50px rail height is the vertical-budget win that pane
      // was rebuilt for, and it is CT-pinned. The fork lives HERE rather than as an override appended to the
      // base, so each arm composes exactly one homed `lib/focus-ring.ts` fragment and neither has to
      // neutralise the other's offset.
      stacked: { tab: `flex-col gap-0 p-field block-auto min-block-(--size-control-sm) min-inline-(--size-touch-target) ${FOCUS_RING_INSET}` },
      // A cell in a rail of view switches (the context pane's state rail): `stacked`, plus the selected cell's tint
      // and a bar on its bottom edge, the seam with the view it selects. The bar stands down where the rail folds
      // into rows (a fine pointer under the `@cq-20` step, `fold`), because there a first-row cell's bottom edge is
      // the seam above row two. At a coarse pointer the cell takes the large control floor.
      cell: {
        tab: [
          `flex-col gap-0 p-field block-auto min-block-(--size-control-sm) min-inline-(--size-touch-target) ${FOCUS_RING_INSET}`,
          "border-be-2 border-transparent data-active:border-primary data-active:bg-primary/15 data-active:text-foreground",
          "pointer-coarse:min-block-(--size-control-lg) pointer-fine:@max-cq-20:data-active:border-transparent",
        ],
      },
    },
    // A cell in a rail that does not hold the current view steps its ink quieter; the active rail keeps the base.
    quiet: { true: { tab: "text-muted-foreground/90" }, false: {} },
    // The list's own bottom hairline, or none when the list sits in a band that already draws the edge.
    listRule: { bottom: {}, none: { list: "border-be-0" } },
    // A rail of exactly six cells folds into rows of three under the `@cq-20` step at a fine pointer, so no caption
    // clips; a phone keeps one row and scrolls.
    fold: { true: { list: "pointer-fine:@max-cq-20:grid-flow-row pointer-fine:@max-cq-20:grid-cols-3" }, false: {} },
    // A tab column topped by the accent rule: the context pane's bracket, which says the pane belongs to the view.
    topRule: { none: {}, primary: { root: "border-bs-2 border-primary/55" } },
    panelGround: {
      none: {},
      sidebar: { panel: GROUND.sidebar },
    },
  },
  defaultVariants: { layout: "inline" },
});
