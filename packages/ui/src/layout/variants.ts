// Layout recipes define spacing intent; features consume the variants. Line-local exceptions license custom tracks.
import {
  ARRIVAL,
  CAP,
  CAPTION,
  CARD_CORNERS,
  CENTRED,
  CORNER,
  DISABLED_STATE_NATIVE,
  FIELD_ROW,
  FILL,
  FLOOR,
  FOCUS_RING,
  GROUND,
  GROW,
  HEIGHT,
  HIDDEN_AT,
  HOVER_DIM,
  HOVER_REVEAL,
  INERT_UNTIL_HOVER,
  INLINE_FIELD_ROW,
  MAX_HEIGHT,
  MIN_HEIGHT,
  MIN_WIDTH,
  PASS_THROUGH,
  PINNED,
  PLACED,
  PUSH,
  READING_INSET,
  RECEDED,
  SCROLL_FADE_X_CLASS,
  SCROLL_FADE_Y_CLASS,
  SCROLLER_Y,
  SELF,
  SR_ONLY_AT,
  TEXT_ALIGN,
  TONE_ARMS,
  TOUCH_FLOOR_AT_COARSE,
  tv,
  WALLPAPER_PLATE,
  WIDTH,
  WRAP,
} from "#lib";
import { ART_DECORATION } from "../lib/art-decoration.ts";

const GAP = {
  // The small-end step (UI-Density-Law.md §2.2/D2): ATOM gaps inside an island — label↔bar,
  // glyph↔text, value↔caption. Below `field`; not a surface/block rhythm, so it has no PADDING twin.
  tight: "gap-tight",
  field: "gap-field",
  row: "gap-row",
  block: "gap-block",
  section: "gap-section",
  gutter: "gap-gutter",
  // Between glyph buttons: pointer-conditional and density-proof, so their touch-floor hit areas never overlap.
  glyph: "gap-glyph-gap",
} as const;
const PADDING = {
  tight: "p-tight",
  field: "p-field",
  row: "p-row",
  block: "p-block",
  section: "p-section",
  gutter: "p-gutter",
} as const;
// One axis of the same ramp: `paddingInline` writes `px-*` and `paddingBlock` writes `py-*`. `tight` is the atom inset
// of a small island (a diagram's margin, a divider's side room); the narrow arms below step a roomy inset down for a pane
// too tight to spend it. Each class is a whole literal so Tailwind's scanner sees it.
const PADDING_INLINE = {
  tight: "px-tight",
  field: "px-field",
  row: "px-row",
  block: "px-block",
  section: "px-section",
  gutter: "px-gutter",
} as const;
const PADDING_BLOCK = {
  tight: "py-tight",
  field: "py-field",
  row: "py-row",
  block: "py-block",
  section: "py-section",
  gutter: "py-gutter",
} as const;
// One edge of the same ramp. `clearance` is the room a box keeps clear of a control floating over that edge.
const PADDING_BLOCK_START = {
  tight: "pbs-tight",
  field: "pbs-field",
  clearance: "pbs-(--size-control-clearance)",
  row: "pbs-row",
  block: "pbs-block",
  section: "pbs-section",
  gutter: "pbs-gutter",
} as const;
const PADDING_BLOCK_END = {
  tight: "pbe-tight",
  field: "pbe-field",
  row: "pbe-row",
  block: "pbe-block",
  section: "pbe-section",
  gutter: "pbe-gutter",
} as const;
const PADDING_INLINE_START = {
  tight: "ps-tight",
  field: "ps-field",
  row: "ps-row",
  block: "ps-block",
  section: "ps-section",
  gutter: "ps-gutter",
} as const;
const PADDING_INLINE_END = {
  tight: "pe-tight",
  field: "pe-field",
  clearance: "pe-(--size-control-clearance)",
  row: "pe-row",
  block: "pe-block",
  section: "pe-section",
  gutter: "pe-gutter",
} as const;
// The inline inset a box gives up below the `cq-28` container step (a phone-width pane), on both sides. It only ever steps down,
// so `tight` is a member here and a full ramp is not.
const PADDING_INLINE_NARROW = {
  tight: "@max-cq-28:px-tight",
  row: "@max-cq-28:px-row",
  block: "@max-cq-28:px-block",
} as const;
// The same, on the inline-end edge alone: a box whose start edge holds what sits beside it keeps that inset at every width.
const PADDING_INLINE_END_NARROW = {
  tight: "@max-cq-28:pe-tight",
  row: "@max-cq-28:pe-row",
  block: "@max-cq-28:pe-block",
} as const;
// The gap a box gives up below the same step, as `paddingInlineNarrow` gives up its inset. It only steps down to none, a small atom or a
// related-control gap, so the larger steps are no member.
const GAP_NARROW = {
  none: "@max-cq-28:gap-0",
  tight: "@max-cq-28:gap-tight",
  field: "@max-cq-28:gap-field",
  row: "@max-cq-28:gap-row",
} as const;
// A nested level: what hangs under a parent row or beside a leading rule, one `block` step in, because a nested group is a block of its
// parent (UI-Density-Law.md §2.2). One step at every level, so a feature never picks an indent.
const INDENT = { true: "ps-block", false: "" } as const;
// The layer a box takes in its stacking context: `raised` floats over its siblings, `overlay` over the raised ones.
const LAYER = { raised: "z-(--z-raised)", overlay: "z-(--z-overlay)" } as const;
// A box laid over content that takes no pointer itself: clicks fall through to what lies under it, and only a child that asks for the pointer takes it.
// A capped box centres in the room its cap leaves.
// A box that crosses its parent's inline inset to the parent's edge and keeps its content where it was: the bleed and the inset that
// pays it back are one choice, so they cannot drift apart. `row` and `section` name the inset crossed.
const REACH = {
  row: "-mx-row px-row",
  section: "-mx-section px-section",
} as const;
// A Row's own reach. `column` and `page` cross the two reading boxes' insets, from the one table that lays those insets, phone step
// included. `header` and `foot` cross a message card's own edges, whose insets are the `--row-reach-*` the card sets: a `header` keeps
// that inset as its own, and a `foot` keeps the card's text inset and crosses the card's foot, so its group ends at the card's corner.
const ROW_REACH = {
  ...REACH,
  column: READING_INSET.plate.reach,
  page: READING_INSET.page.reach,
  header: "-ms-(--row-reach-left) -me-(--row-reach-right) ps-(--row-reach-left) pe-(--row-reach-right)",
  foot: "-ms-(--row-reach-left) -me-(--row-reach-right) -mbe-row ps-(--row-foot-inset-left) pe-(--row-foot-inset-right)",
} as const;
const ALIGN = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
} as const;

const JUSTIFY = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
} as const;

// A row that gives up its width below a container step (`--container-cq-<rem>`, so the pane decides, never the viewport) turns into a
// column (`stackBelow`), whose children take the full width or pack to the end (`alignBelow`), and its trailing cluster lines up at the
// end (`endBelow`). Each key names a step of the container scale and each arm writes one class as a whole literal, so Tailwind's scanner
// sees it.
const STACK_BELOW = {
  "cq-28": "@max-cq-28:flex-col",
  "cq-40": "@max-cq-40:flex-col",
  "cq-32": "@max-cq-32:flex-col",
  "cq-64": "@max-cq-64:flex-col",
} as const;
// The stacked row's cross-axis alignment, by value and step: `stretch` fills the width, `end` is for a row that reads from the trailing edge.
const ALIGN_BELOW = {
  "stretch-cq-28": "@max-cq-28:items-stretch",
  "stretch-cq-32": "@max-cq-32:items-stretch",
  "stretch-cq-40": "@max-cq-40:items-stretch",
  "stretch-cq-64": "@max-cq-64:items-stretch",
  "end-cq-28": "@max-cq-28:items-end",
} as const;
const END_BELOW = {
  "cq-28": "@max-cq-28:justify-end",
  "cq-32": "@max-cq-32:justify-end",
  "cq-40": "@max-cq-40:justify-end",
  "cq-64": "@max-cq-64:justify-end",
} as const;
// The row reads from its end, so a trailing control comes first on screen while the DOM order stays the reading order: at every width (`true`, a
// mirrored speaker's row), or below a container step as `stackBelow`'s sibling.
const REVERSE = {
  true: "flex-row-reverse",
  false: "",
  "cq-28": "@max-cq-28:flex-row-reverse",
  "cq-40": "@max-cq-40:flex-row-reverse",
  "cq-32": "@max-cq-32:flex-row-reverse",
  "cq-64": "@max-cq-64:flex-row-reverse",
} as const;

// The coarse floors a layout box owns: its own block size (a row of text-height values whose hit areas must fit
// inside it), or the pitch between tiled control cells. Declared after `gap` in each recipe so the coarse gap wins.
const TOUCH_FLOOR = { block: TOUCH_FLOOR_AT_COARSE.block, gap: TOUCH_FLOOR_AT_COARSE.gap } as const;

// A hairline on one edge, in the border ink: how a box separates from its neighbour inside a surface without becoming
// a box (UI-Density-Law.md CD2). `top` and `bottom` are the block edges, `start` and `end` the inline ones.
const DIVIDER = {
  start: "border-s border-border",
  end: "border-e border-border",
  top: "border-bs border-border",
  bottom: "border-be border-border",
  // A hairline between siblings in a list: the bottom edge on every box but the last, so the list ends clean.
  between: "border-be border-border last:border-be-0",
} as const;

// The divider's weight and ink. `rule` is the 2px step for an edge that marks a state or a boundary (a set override,
// a consent ask, the rail's seam in a preview) rather than separating neighbours; it is compound on the edge, so it
// thickens only the edge that `divider` draws. `dividerTone` recolours that edge for the sidebar's seam in a preview.
const DIVIDER_TONE = {
  border: "",
  sidebar: "border-sidebar-border",
} as const;
// A colour tone marks its divider edge with the tone's `solid` role, because a rule that marks a state carries meaning
// (D336). The component stamps `data-tone`, so the role resolves on the box.
const DIVIDER_MEANING = { ...TONE_ARMS, primary: "border-tone-solid", warning: "border-tone-solid" } as const;
// A dashed edge marks a doorway (a place to start something) rather than a boundary between neighbours.
const DIVIDER_STYLE = { solid: "", dashed: "border-dashed" } as const;
const DIVIDER_RULE = [
  { divider: "start", dividerWeight: "rule", class: "border-s-rule" },
  { divider: "end", dividerWeight: "rule", class: "border-e-rule" },
  { divider: "top", dividerWeight: "rule", class: "border-bs-rule" },
  { divider: "bottom", dividerWeight: "rule", class: "border-be-rule" },
] as const;

// A run of decorative fill, cut off at one edge into the ground: the cue that a scrolled strip hides more past that
// edge. `fadeFrom` is the fill the strip sits on, so the fade dissolves into it.
const FADE = {
  start: "bg-linear-to-r via-60% to-transparent",
  end: "bg-linear-to-l via-60% to-transparent",
} as const;
const FADE_FROM = { raised: "from-surface-raised", sidebar: "from-sidebar" } as const;

// A surface the router or a list hands focus to (`tabIndex={-1}`) draws no outline of its own: arrival is announced, not
// painted, and the controls inside draw their own rings.
const FOCUS_TARGET = { true: "outline-none", false: "" } as const;

// The edge-fade recipe for a box that scrolls on one axis (`globals.css`); the `useScrollFadeX`/`useScrollFadeY` hooks
// mark which edges are hiding content, and the fade shows only there.
const SCROLL_FADE = { x: SCROLL_FADE_X_CLASS, y: SCROLL_FADE_Y_CLASS } as const;

// A box that scrolls on the block axis inside a bounded parent. It needs no `min-block-0`: a scroll container's automatic
// minimum size is already 0, so as a flex or grid item it shrinks to its track instead of growing to its content.
const SCROLL = { y: SCROLLER_Y } as const;

// `dialog-stacked` is two conditions, so it has no negation to hide under: this arm restores the display, and only a flex box can name it.
const BOX_HIDDEN_AT = { ...HIDDEN_AT, unlessDialogStacked: "hidden dialog-stacked:flex" } as const;

// A wrapped child that queues behind its siblings until the container is wide enough to seat it beside them, where its
// `floor="line"` basis gives way to its content's width.
const ORDER = { lastUntilWide: "order-last @cq-40:order-0 @cq-40:basis-auto" } as const;

// `fill` takes the parent's whole block size.
// The `gutterCentred` tracks, shared by `Grid cols` and `Row tracks` (the annotation gutter beside a centred measure,
// explained at the `Grid` member).
const RECEDED_MOTION = "transition-opacity duration-(--motion-base) ease-out-expo";

const GUTTER_CENTRED_TRACKS = "grid-cols-[auto_minmax(0,1fr)] @cq-56:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]";

export const stackVariants = tv({
  base: "flex flex-col",
  variants: {
    gap: GAP,
    gapNarrow: GAP_NARROW,
    align: ALIGN,
    justify: JUSTIFY,
    padding: PADDING,
    paddingInline: PADDING_INLINE,
    paddingBlock: PADDING_BLOCK,
    paddingBlockStart: PADDING_BLOCK_START,
    paddingBlockEnd: PADDING_BLOCK_END,
    paddingInlineStart: PADDING_INLINE_START,
    paddingInlineEnd: PADDING_INLINE_END,
    paddingInlineNarrow: PADDING_INLINE_NARROW,
    // The block-start inset a box gives up at a phone-width pane.
    paddingBlockStartNarrow: { none: "@max-cq-32:pbs-0" },
    paddingInlineEndNarrow: PADDING_INLINE_END_NARROW,
    indent: INDENT,
    layer: LAYER,
    passThrough: PASS_THROUGH,
    reach: REACH,
    // A reading box keeps its element across the skins, so its flow is a choice here, not another primitive: `weld` seats the body beside its art, and
    // `page` is the grid a pinned band stays pinned in.
    readingFlow: { weld: "flex-row", page: "grid" },
    // THE ROW-PITCH FLOOR (#884 C3 — #850's class: rows of floorless inline-edit affordances stacked at a
    // sub-floor pitch, so a Button's hit pseudo overflows onto the NEIGHBOUR ROW'S TEXT and loses
    // hit-testing to it; 28 P1 tap-targets on one rpg tab). `control` floors every DIRECT child at the
    // pointer-conditional `--size-control-sm` (44px coarse / 32px fine — clears design-audit's 24px fine
    // floor), so each row seats its own controls' hit areas instead of lending them to the row below. One
    // token at the container, because no control primitive can own PITCH and a per-row `min-h-*` is the
    // N-site spelling of the same fact (gate `no-floorless-control-in-wrap`, the vertical-pitch arm).
    rows: { control: "*:min-block-(--size-control-sm)" },
    // The stack is itself the container its descendants query (an element never queries itself). `size` also
    // contains the block axis, for `cqb` and `cqmin` units.
    container: { true: "@container", size: "@container-size" },
    hiddenAt: BOX_HIDDEN_AT,
    srOnlyAt: SR_ONLY_AT,
    touchFloor: TOUCH_FLOOR,
    divider: DIVIDER,
    dividerWeight: { hairline: "", rule: "" },
    dividerTone: DIVIDER_TONE,
    dividerStyle: DIVIDER_STYLE,
    tone: DIVIDER_MEANING,
    // A box that recedes eases its opacity on the base motion step in both directions, so a flag that flips fades the
    // box instead of snapping it; the reduced-motion floor removes the transition.
    receded: { true: `${RECEDED} ${RECEDED_MOTION}`, false: RECEDED_MOTION },
    ground: GROUND,
    plate: WALLPAPER_PLATE,
    // The ink drawn art inside the box inherits through `currentColor` (a diagram in a picker cell whose host recedes).
    // `prose` is the reading ink; `muted` keeps the muted ink over a wallpaper plate's own ink too (a notice row).
    ink: { inherit: "", foreground: "text-foreground", prose: "text-prose-body", muted: "text-muted-foreground in-data-has-bg-image:text-muted-foreground" },
    cardCorners: CARD_CORNERS,
    hoverDim: HOVER_DIM,
    // How an image painted as the box's background fills it: `cover` crops it about its centre; `underFeather` lays a
    // gradient over a cover image anchored at the top, the gradient filling the box.
    imageFit: { cover: "bg-cover bg-center bg-no-repeat", underFeather: "bg-size-[auto,cover] bg-position-[left_top,center_top] bg-no-repeat" },
    artDecoration: ART_DECORATION,
    artMask: { start: "orb-art-mask-start", end: "orb-art-mask-end" },
    // The content column's cap, which a stylesheet rule reads from `--column-measure`: `illustrated` reserves an art pane
    // beside the measure; `tide` takes its share of the row (more on a phone), never past the reading measure.
    columnMeasure: {
      illustrated: "orb-art-reservation",
      tide: "[--column-measure:var(--reading-tide-share-cap)] @max-cq-28:[--column-measure:var(--reading-tide-share-phone)]",
    },
    // The art pane beside or above a message. `portrait` is its width, its portrait aspect, and on a phone the fixed height the echo art takes
    // instead of the aspect. `banner` is half the card's width (more on a phone, with a minimum height) and never past the banner's own cap.
    artPane: {
      banner: `
        inline-1/2 max-inline-(--immersive-whisper-banner-inline-cap)
        @max-cq-28:inline-11/20 @max-cq-28:min-block-(--immersive-whisper-band-min-height-phone)
      `,
      portrait: `
        aspect-(--aspect-portrait) orb-art-reservation inline-(--art-pane-width) max-block-full
        @max-cq-28:aspect-auto @max-cq-28:block-(--immersive-echo-art-height-phone)
      `,
    },
    feather: {
      bubble: "orb-art-band [--art-feather-fill:var(--color-ai-bubble)]",
      userBubble: "orb-art-band [--art-feather-fill:var(--color-user-bubble)]",
      systemBubble: "orb-art-band [--art-feather-fill:var(--color-system-bubble)]",
    },
    // The side a feathered band dissolves toward: the foot by default, or the left edge for a band that sits at the
    // right of its card. Physical, like the art masks beside it.
    featherToward: { left: "[--art-feather-toward:to_left]" },
    // Art that rests dimmed: `lift` is also a tap target, which returns to full under the pointer.
    artDim: { rest: "opacity-(--immersive-whisper-band-opacity)", lift: "opacity-(--immersive-whisper-band-opacity) hover:opacity-100" },
    // A list item that genuinely arrives eases in from `from` to `settle`; a remounted item takes neither.
    arrival: ARRIVAL,
    focusTarget: FOCUS_TARGET,
    cap: CAP,
    width: WIDTH,
    centred: CENTRED,
    fill: FILL,
    // `bandHead` is the solid head of a feathered art band, above where the feather starts.
    height: { ...HEIGHT, bandHead: "block-3/5" },
    grow: GROW,
    floor: FLOOR,
    push: PUSH,
    self: SELF,
    maxHeight: MAX_HEIGHT,
    // The lines of the runs inside: `endWide` sets a figure's lines at the end once the container is wide enough to seat it beside its title.
    textAlign: { ...TEXT_ALIGN, endWide: "@cq-40:text-end" },
    order: ORDER,
    minHeight: MIN_HEIGHT,
    minWidth: MIN_WIDTH,
    scroll: SCROLL,
    // After `scroll`, whose containing block a placed box replaces.
    placed: PLACED,
    scrollFade: SCROLL_FADE,
    fade: FADE,
    fadeFrom: FADE_FROM,
  },
  compoundVariants: [...DIVIDER_RULE],
});

// Inline bleed preserves glyph hit areas inside the scroller; scroll padding clears its sticky action footer.
const DIALOG_SCROLL_CLASS =
  "relative -mx-glyph-bleed min-block-0 overflow-x-hidden overflow-y-auto overscroll-contain px-glyph-bleed scroll-pbe-(--size-control-lg)";

export const dialogBodyVariants = tv({
  base: DIALOG_SCROLL_CLASS,
  variants: { grow: { true: GROW.true, false: GROW.false } },
});

export const rowVariants = tv({
  base: "flex flex-row items-center",
  variants: {
    gap: GAP,
    gapNarrow: GAP_NARROW,
    align: ALIGN,
    justify: JUSTIFY,
    // The row sits inside a line of text, as wide as its content.
    inline: { true: "inline-flex" },
    wrap: WRAP,
    stackBelow: STACK_BELOW,
    reverse: REVERSE,
    alignBelow: ALIGN_BELOW,
    endBelow: END_BELOW,
    cap: CAP,
    width: WIDTH,
    grow: GROW,
    floor: FLOOR,
    push: PUSH,
    self: SELF,
    placed: PLACED,
    maxHeight: MAX_HEIGHT,
    order: ORDER,
    pinned: PINNED,
    fill: FILL,
    // `rail` is a slot fixed at the glyph height (its controls stay reachable) that takes its content's height, never less than the glyph, in a narrow container.
    // `none` takes no room, for a parked box only a measure reads.
    height: { ...HEIGHT, rail: "block-(--size-glyph-lg) min-block-(--size-glyph-lg) @max-cq-20:block-auto", glyph: "block-(--size-glyph-lg)", none: "block-0" },
    // A row of a short dialog gives its block inset back to the content.
    paddingBlockShort: { none: "dialog-short:py-0" },
    minHeight: MIN_HEIGHT,
    minWidth: MIN_WIDTH,
    padding: PADDING,
    paddingInline: PADDING_INLINE,
    paddingBlock: PADDING_BLOCK,
    paddingBlockStart: PADDING_BLOCK_START,
    paddingBlockEnd: PADDING_BLOCK_END,
    paddingInlineStart: PADDING_INLINE_START,
    paddingInlineEnd: PADDING_INLINE_END,
    paddingInlineNarrow: PADDING_INLINE_NARROW,
    // The block-start inset a box gives up at a phone-width pane.
    paddingBlockStartNarrow: { none: "@max-cq-32:pbs-0" },
    paddingInlineEndNarrow: PADDING_INLINE_END_NARROW,
    indent: INDENT,
    layer: LAYER,
    passThrough: PASS_THROUGH,
    reach: ROW_REACH,
    // A row that must keep its element across a width step takes a grid's tracks; `display: grid` wins over the flex base.
    // Before `hiddenAt`, whose `hidden` beats the display a track set writes.
    tracks: { gutterCentred: `grid ${GUTTER_CENTRED_TRACKS}` },
    hiddenAt: BOX_HIDDEN_AT,
    srOnlyAt: SR_ONLY_AT,
    touchFloor: TOUCH_FLOOR,
    divider: DIVIDER,
    dividerWeight: { hairline: "", rule: "" },
    dividerTone: DIVIDER_TONE,
    dividerStyle: DIVIDER_STYLE,
    tone: DIVIDER_MEANING,
    receded: { true: RECEDED, false: "" },
    // A box that stays mounted so it can be measured but takes no room, paints nothing and takes no pointer: a part that has
    // moved into an overflow menu, or a probe that reads a width. Pair it with `inert` so focus skips it too.
    outOfFlow: { true: "orb-out-of-flow", false: "" },
    // A row of trailing actions that reveals on the nearest `group` ancestor's hover.
    reveal: HOVER_REVEAL,
    inertUntilHover: { true: INERT_UNTIL_HOVER, false: "" },
    focusTarget: FOCUS_TARGET,
    scrollFade: SCROLL_FADE,
    ground: GROUND,
    plate: WALLPAPER_PLATE,
    cardCorners: CARD_CORNERS,
  },
  compoundVariants: [...DIVIDER_RULE],
});

// A mark pinned to its positioned host's block-start, inline-end corner (see corner.tsx): `field` is the standard inset, `tight` a mark on a
// glyph-sized host that must stay clear of the glyph. A flex box, so the mark inside has no baseline gap under it.
export const cornerVariants = tv({
  base: "flex",
  variants: { inset: { field: CORNER.badge, tight: CORNER.tight } },
  defaultVariants: { inset: "field" },
});

// One-cell overlay stack (see layer.tsx). A single explicit `1fr`-free track that every child is placed
// into by name, so the column sizes to the WIDEST child and each child stretches to it. No `gap` axis: one
// cell has nothing to space, and no `align`/`justify` — each overlaid child brings its own (they are Rows
// and Stacks). `col-start-1`/`row-start-1` are real utilities on purpose: the equivalent `[grid-area:1/1]`
// would be an arbitrary property in a file features read from.
export const layerVariants = tv({
  base: "grid grid-cols-1 grid-rows-1 *:col-start-1 *:row-start-1",
  variants: { minHeight: MIN_HEIGHT },
});

// No external `py` — a Section pads its own content but leaves between-section spacing to the
// container's `gap` (padding-as-margin double-counts against gap). Space sections via Stack/Grid gap.
export const sectionVariants = tv({
  slots: {
    root: "flex flex-col gap-block",
    heading: "text-title leading-title font-medium text-foreground",
    // inline-flex so the hint trigger sits on the heading's baseline instead of dropping to its own line
    // (mirrors the Field label/hint row, field/variants.ts).
    headingRow: INLINE_FIELD_ROW,
    // The KICKER band (UI-Density-Law.md §2.3/§4.3): a caps micro label + a hairline rule running to the
    // edge. This is the CD1 replacement for a box — a read-only grouping gets a name and a rule, never a
    // border+radius+bg. The type itself is the `kicker` VOICE on a real <Heading> (one spelling, in
    // text/variants.ts); only the band's layout lives here.
    kickerRow: FIELD_ROW,
  },
  variants: {
    // The section is the container its descendants query (an element never queries itself).
    container: {
      true: { root: "@container" },
    },
    // The cap a section holds its rows to; only the reading measure has a caller, so it is the only arm.
    cap: { reading: { root: CAP.reading } },
    width: { full: { root: WIDTH.full } },
    fill: { true: { root: "block-full" }, false: { root: "" } },
    // A section whose only body is grafted in leaves the page with it, kicker and all.
    hiddenAt: { emptyBody: { root: HIDDEN_AT.emptyBody } },
    // A hairline under the section heading — reads as a header edge over its rows, not a floating label.
    divider: {
      true: { heading: "border-be border-border pbe-field" },
    },
    // THE TWO SPELLINGS OF ONE CD1 GROUPING (added 2026-08-17, program #102 variant B). `stacked` is the
    // literal reading: the kicker stands on its own line with a rule running to the edge. `inline` moves
    // the rule ABOVE the group as the section's own `border-top` and lets the kicker LEAD the control
    // line — same two marks, same mechanism, ~17px per group cheaper, which on a 291px LIST pane is a
    // whole chip row. MEASURED on the characters pane, whose two groups this shipped for: naming both of
    // them cost **+2px** of chrome above the first row (260.25 → 262.25 at the docked width) against the +22px the
    // stacked spelling costs — on a pane already spending 38.6% of its height on chrome.
    //
    // The root itself becomes the wrapping control line, so the kicker is a flex ITEM of the group rather
    // than a block above it; `gap-tight` is the atom gap those controls sit at (a rail of chips is atoms,
    // not blocks) and the `pt-row` is the breathing room under the rule.
    kickerLayout: {
      stacked: {},
      inline: {
        root: "flex-row flex-wrap items-center gap-tight border-bs border-border pbs-row",
        kickerRow: "me-field shrink-0",
      },
    },
  },
  defaultVariants: { kickerLayout: "stacked" },
});

/** Responsive auto-fit columns: children tile as many columns as fit at the min width, then reflow down to one. */
export const gridVariants = tv({
  base: "grid",
  variants: {
    gap: GAP,
    // The two axes of a grid are different jobs: `gapInline` separates its columns and `gapBlock` its rows.
    gapInline: { row: "gap-x-row", block: "gap-x-block" },
    gapBlock: { tight: "gap-y-tight", field: "gap-y-field" },
    // A snapping track keeps its edge item clear of the scrollport's edge.
    scrollInset: { section: "scroll-px-section" },
    cap: CAP,
    width: WIDTH,
    paddingInline: PADDING_INLINE,
    reach: REACH,
    cols: {
      auto: "grid-cols-[repeat(auto-fit,minmax(min(var(--width-cell-auto),100%),1fr))]",
      wide: "grid-cols-[repeat(auto-fit,minmax(min(var(--width-cell-wide),100%),1fr))]",
      // Dense compact tiles (the OSRS stat-cell / attribute grid): a narrow
      // min so the CONTEXT panel tiles stat cells 2-up at the 17rem floor, 3-up when it has room.
      tile: "grid-cols-[repeat(auto-fit,minmax(min(var(--width-cell-tile),100%),1fr))]",
      // Item-cell density (the pack grid). The 3.5rem SQUARE this used to be tiled 5-up
      // but carried only a 20px glyph inside a 59px card: mostly empty box, with the item's location
      // truncated to "belt p…" and the ×N a lost corner digit (owner dogfood, 2026-07-31). An 8.5rem min
      // tiles 2-up at the 320px mobile column and 3-up in the 480px docked CONTEXT panel, at a card SHORTER
      // than the old square — the wasted space goes and the datum (name · ×N · where it's kept) fits.
      cell: "grid-cols-[repeat(auto-fit,minmax(min(var(--width-cell-fixed),100%),1fr))]",
      // A DELIBERATE TWO-COLUMN ROW whose second column is NOT optional (the preset drill-ins' DELIVERY and
      // PLACEMENT rows — role beside depth, zone beside order). Every other arm here is auto-FIT, which
      // COLLAPSES a track holding no item: a conditionally-rendered second field (O-9's depth/order, absent
      // on the Relative arm) therefore doubles the surviving control's width the instant it disappears, and
      // the row re-flows under a field the user never touched. Two explicit halves hold the same geometry in
      // BOTH arms. The container query — not a viewport breakpoint — stacks them back to one column in a
      // narrow pane, so the row answers to the pane it lives in; an ancestor `<Container>` is required
      // (an element cannot query itself).
      pair: "grid-cols-1 @cq-28:grid-cols-2",
      // THE SETTINGS-ROW TRACK SET (#932) — four tracks a whole SECTION of rows shares by subgrid:
      // [label+gloss | control | reserved action cell | slack]. It is not a tiling and not a ratio, so no
      // arm above can express it, and the SIZING IS THE FIX: a settings row's control starts at a column
      // the TOKEN decides, so the distance from a name to its control stops being a function of the PANE.
      // That distance was the defect — `row-void` fired 8x on Config at 63-77% of the row in every pane
      // state EXCEPT the one that narrowed the content column to ~520px (#1099 G6), i.e. it was
      // `justify-between` against a window width. MEASURED after: 0 row-void findings in ALL FOUR pane
      // states, and the label-to-control gap on the Appearance pane went 557px -> 34px.
      //
      // FIXED tracks at `width.control-col`, not intrinsic ones — and the three arms were all measured,
      // so do not "improve" this back:
      //   · a bare `max-content` label track has a max-content BASE size, so every item spanning it dumps
      //     its full intrinsic contribution there. With a real section attached the tracks resolved to
      //     `855px 0px 16px 0px` inside a 545px group: the label track swallowed a textarea row's
      //     max-content, the control track collapsed to ZERO, its number input measured 0px wide, and the
      //     row overflowed its own group by 362px.
      //   · `fit-content(width.label-col)` (9.5rem, the knob deck's column) clamps the blow-out but is too
      //     narrow for a settings row's NAME: it wrapped five of fifteen Chat-behavior labels to two lines
      //     ("Send continues the reply", "Empty Enter generates a reply", "Auto-swipe short replies",
      //     "Custom stopping strings", "Offer choices in new chats"). A track set that tightens a row must
      //     not do it by breaking the row's name.
      //   · `fit-content(width.control-col)` fixes the wrapping but sizes each SECTION to its own longest
      //     label, so the Appearance pane still showed three control edges (799 x10 / 788 x5 / 747 x1) and
      //     its canvas section's action cells sat 278px left of every knob row's.
      //   · FIXED — this arm — gives the Appearance pane ONE control edge (799 x16) and ONE action edge
      //     (827 x20), and Chat behavior 799 x15 / 827 x15, against the re-drive's five and four. A fixed
      //     track also contributes nothing to intrinsic sizing, so the blow-out above is unrepresentable.
      // The cost is stated rather than hidden: the LONGEST LABEL no longer sets the column, the token
      // does. That is sound only while the token is wider than every converted label — verified on both
      // converted panes — and a label that outgrows it wraps rather than pushing its neighbours.
      //
      // The FOURTH track is the `minmax(0,1fr)` SLACK: it absorbs the block's leftover width so the three
      // real tracks stay LEFT-PACKED, and it gives a full-span row — a canvas, a picker, a composite's
      // dependents — a real width to lay out in.
      //
      // Below the container step the whole thing drops to ONE column and every subgrid in the chain (row,
      // then Field) inherits that — the narrow arm is a container query on the group, never a per-row flip
      // and never a viewport media query. Requires an ancestor `<Container>`; `SettingRowGroup` renders one
      // (an element cannot query itself).
      settingTrack: "grid-cols-1 @cq-32:grid-cols-[var(--width-control-col)_var(--width-control-col)_auto_minmax(0,1fr)]",
      // Short selection lists share an intrinsic label track and a natural-sized mark, even in a narrow host.
      choiceTrack: "grid-cols-[fit-content(var(--width-control-col))_fit-content(var(--size-touch-target))]",
      // `pair`'s THREE-column sibling, same contract and same reason (added 2026-08-19, the refinery
      // teaching flow). Three cells that are ONE sequence — Score → Rewrite → Analyze — must be equal
      // bases: as a wrapping flex row of content-sized cards they measured 279/384/482px, i.e. the three
      // steps of one pipeline drawn as a staircase, with the longest sentence claiming the most emphasis.
      // Auto-fit cannot express it (a track holding a short cell collapses, which is the staircase again);
      // an explicit 3 makes each step exactly a third of the row. Container-queried, `pair`'s precedent:
      // below the step the cells stack to one column rather than crushing three sentences into thirds of a
      // phone. Requires an ancestor `<Container>` — an element cannot query itself.
      triple: "grid-cols-1 @cq-28:grid-cols-3",
      // A DOMINANT LEAD column beside a companion RAIL (added 2026-08-16, program #102 — the landing/
      // reading shape). Every arm above is auto-FIT: equal tracks, count chosen by width. This one is
      // deliberately UNEQUAL and its two tracks are both required — a lead column you read and a rail you
      // reach into. `fr` on both, no max-width cap, so the pair FILLS its pane instead of centring inside
      // it; the lead's own prose caps itself at `--reading-measure-prose` (#1145 — the teaching/body
      // measure; the transcript keeps the wider `--reading-measure`), which is where a measure belongs (on
      // the paragraph, not on the page).
      //
      // CONTAINER-query driven, `pair`'s precedent: one column until the pane can genuinely hold two, and
      // at a very wide pane the RAIL widens rather than the lead's line stretching past its measure — a
      // bigger monitor should put more of the surface in reach, not print a longer line.
      lead: "grid-cols-1 @cq-56:grid-cols-(--grid-lead) @cq-96:grid-cols-(--grid-lead-wide)",
      // `lead`'s EARLIER FIRST BREATH (added 2026-08-18, #244 P1-2). Identical tracks at both steps; it
      // differs only in WHEN the split engages — `@3xl` (48rem/768px) instead of `@4xl` (56rem/896px).
      //
      // It exists because 896px is a width the pane never has. Measured on the shipped default view
      // (`snap / --goto corpus`, 1280 viewport, LIST pane docked + CONTEXT pane collapsed, re-measured after
      // the #242 both-docked squeeze): the corpus overview's `@container` resolves to 868.81px, so the
      // designed composition — the focal island beside its readiness rail — missed by 27px and rendered as a
      // stack of full-width bands in the one view the owner actually looks at. It misses in every appearance
      // arm (defaults 868.8 · maximal 868.8 · compact 884.8 · reading 810 · diagnostics 868.8), so it was
      // never a per-arm accident. `@3xl` clears the narrowest of those by 42px and still leaves the
      // three-pane state (484px) and the phone column stacked, which is where one column is right.
      //
      // A SEPARATE ARM, not a retune of `lead`: `lead`'s other consumer WAS the
      // config welcome hearth (retired by #1210), whose own CT declared the `@4xl` width as the one its split had
      // to engage at. Moving the
      // shared value would change a surface nobody measured. Reach for `leadEarly` when the pane holding the
      // split is a docked CONTENT region rather than a whole page.
      leadEarly: "grid-cols-1 @cq-48:grid-cols-(--grid-lead) @cq-96:grid-cols-(--grid-lead-wide)",
      // FIXED cells, variable COUNT (added 2026-08-16, program #102). `cell` is auto-FIT + `1fr`, so extra
      // width makes each cell BIGGER; a portrait shelf measured 250px faces at a 2000px viewport and read
      // as a gallery instead of a shelf you reach into. `auto-fill` at a fixed track spends surplus width
      // on MORE cells and leaves the cell alone — the right answer wherever the cell is a picture of a
      // thing rather than a container for text. The private track alias is 8.5rem under comfortable/default
      // and 7.5rem under compact density; `cellShelf` deliberately keeps its separate 8.5rem contract.
      cellFixed: "grid-cols-[repeat(auto-fill,var(--orb-grid-cell-fixed))]",
      // `cellFixed`'s swipe twin: one row that scrolls and snaps sideways. The scroller clips both axes, so it pads a
      // focus ring's reach on the block axis and takes it back as negative margin: the ring shows, the box holds.
      cellSwipe: "-my-tight snap-x snap-mandatory auto-cols-(--orb-grid-cell-fixed) grid-flow-col overflow-x-auto overscroll-x-contain py-tight",
      // `cellFixed`'s PHONE ARM (added 2026-08-30, #864 — the Characters landing shelves). Identical at
      // every pane width the desktop shape reaches; it differs only BELOW `@cq-28`, where the fixed 8.5rem
      // track stops being the right answer. Measured against the approved 430px artboard: a 430px CONTENT
      // pane spends 2×`p-block` on its gutters and leaves ~398px, which `auto-fill` at a 136px track fills
      // with exactly TWO cells and ~120px of dead trailing air — the shelf reads as two big pictures rather
      // than a rank you scan. Three equal `1fr` columns spend that air on a third face at ~123px, which is
      // still a legible portrait and is the composition the mock draws.
      //
      // A SEPARATE ARM, not a retune of `cellFixed` (the `leadEarly` precedent): `cellFixed`'s
      // other consumer is the chats HOME quick-picks shelf, which lives inside a home TILE — a box that is
      // already narrower than its pane, so a container-level `@max-md` would fire there at widths where the
      // fixed track is still correct. Reach for `cellShelf` when the shelf IS the pane's full width.
      //
      // Container-queried, `pair`'s precedent — it answers to the pane, not the viewport — so it REQUIRES an
      // ancestor `<Container>` (an element cannot query itself).
      cellShelf: "grid-cols-3 @cq-28:grid-cols-[repeat(auto-fill,var(--width-cell-fixed))]",
      // `pair`'s late twin: one step for Home's split and the shelf blocks that reflow with it, so they turn
      // two-up at the same container width: `@7xl`, an 80rem container, which a 1440 laptop clears at the default
      // rem (owner ruling: about 1400px).
      pairWide: "grid-cols-1 @cq-80:grid-cols-2",
      // A LABEL COLUMN beside its values (added 2026-08-19, side-eye N-2 on the databank detail): a readout
      // whose left track is exactly as wide as its widest LABEL and whose right track takes the rest. Every
      // arm above sizes its tracks by the PANE; this one sizes the first by its own CONTENT, which is the
      // only thing that ties a label to its value at every width.
      //
      // It replaces the knob-row token (`w-(--width-label-col)`, 152px) doing a readout's job: that token is
      // a CONTROL column — it exists so sliders and number fields start at one x down a settings pane — and
      // spent on ~62px labels it left ~90px of nothing inside every row, i.e. the same gap the fixed column
      // was introduced to close, one size smaller. `max-content` is the range property: no slack to grow,
      // whatever the labels or the pane become. The values still share ONE x, because it is one grid rather
      // than a per-row measurement.
      readout: "grid-cols-[max-content_1fr]",
      // A CENTRED MEASURE WITH A LEADING ANNOTATION GUTTER (added 2026-09-05, #1728 arm B). Three tracks:
      // the MIDDLE one is the reading column and it is centred by construction (the two `1fr` rails are
      // equal at every width, whatever the middle track resolves to), and track 1 hangs a chip at its
      // TRAILING edge — `justify-self: end` on the occupant — so the chip sits immediately beside the
      // column without ever entering the box that is being centred. Track 3 is the mirror, for a
      // trailing-annotated row.
      //
      // WHY IT EXISTS AT ALL: every other arm here sizes its tracks by the pane or by its own content, and
      // both of those make an annotated row centre the ANNOTATION+CONTENT pair rather than the content. A
      // row that centres the pair moves its prose sideways by half the chip the moment the chip appears,
      // which is a reader-visible slide on a toggle rather than a layout choice.
      //
      // ONE CONSUMER TODAY: the chat message row's CENTRED skins (`flat`, `hush` and `document`), through
      // `Row tracks` because the row body must keep its element. `bubble` and its family are NOT consumers:
      // their rows are deliberately leading/trailing-anchored, so their identity gutter is part of the
      // shape rather than an annotation beside a centred measure.
      //
      // §13.7 R2, VERBATIM AND CITED: "a second consumer graduates it into a named composite; until then it
      // stays a variant member". Until a second surface asks for this shape, it stays exactly this row —
      // one `cols` member, no primitive — under the ruling that minted it (#1728 arm B, owner 2026-09-05).
      //
      // THE CROSSOVER IS IN THE MEMBER, because it is a property of the SHAPE and not of one caller: a chip
      // can only hang in a margin where a margin exists. Below `@min-[52rem]` the template is the TWO-track
      // in-flow gutter (chip, then column) — byte-identical in effect to the flex row it replaces, and the
      // arm every narrow surface gets, because there the reading column IS the track and there is nothing to
      // hang into. At and above it the three tracks engage and the middle one centres.
      //
      // THE STEP IS DERIVED, THEN ROUNDED UP TO A NAMED ONE. The widest identity chip is
      // `size.avatar-lg` 40px and the centred skins' column is capped at `--reading-measure` (75ch =
      // 750px in the prose font, measured), and a chip fits the margin when `(track - column) / 2 >= 40`,
      // i.e. `track >= 830px`. The step used is `@4xl` (56rem / 896px) — the nearest NAMED container
      // step at or above that minimum, so the consuming feature can spell its matching placement classes
      // without an arbitrary variant. The 830-896px band therefore keeps the in-flow gutter: conservative by
      // one step, never clipping. Container steps are `rem`-denominated, so the whole thing moves with
      // `--appearance-font-scale` exactly like the measure it is derived from.
      //
      // NO ROLE MIRROR: the centred skins seat every role's chip LEADING (owner ruling, as Moonlit Echoes
      // leaves flat, hush and document unmirrored), so one template serves both roles and auto-placement
      // seats the chip then the column with no explicit column-start below the step.
      gutterCentred: GUTTER_CENTRED_TRACKS,
      // AN INSTRUMENT ROW'S THREE CELLS — name · flexing rail · the value cluster (added 2026-08-19,
      // side-eye P1-1 on the preset params deck). `readout`'s sibling, and the same ruling one axis wider:
      // the first track is CONTENT-sized so a name can never be clipped by a box, and the middle track
      // takes the rest so the rail is the only thing that flexes.
      //
      // WHY THE FIRST TRACK IS `minmax(--width-label-col, max-content)` AND NOT BARE `max-content`: the
      // token is what makes a column of knob names read down ONE edge ACROSS clusters — Sampling's short
      // names and Output's long ones are separate grids (a kicker sits between them), so a bare
      // `max-content` would give each cluster its own x. As a MINIMUM it keeps that one edge wherever the
      // names fit, and grows past it exactly where they do not (the fixed box clipped "Max output tokens"
      // at EVERY pane width, 1864 included — the label cell also has to seat the hint trigger).
      //
      // AND IT FOLDS BEFORE THE RAIL DIES. At a narrow pane the fixed name box + the number twin + the reset
      // left the rail 0-28px — a thumb on no track at all. Below `@cq-32` the rail takes the whole width;
      // `@cq-32` and not `@cq-28` because the fold has to happen while there is still a rail worth keeping
      // (measured: the three-track arm needs ~468px of pane before the middle track clears an aimable
      // floor). The step is in `rem`, so it moves with `--appearance-font-scale` — the reading arm folds later, which
      // is exactly right for bigger type.
      //
      // THE FOLDED ARM IS TWO TRACKS, NOT ONE (side-eye 2026-08-30 P2-C). A single column stacked all four
      // cells in turn, which cost two things at once. GEOMETRY: the value cluster took a row of its own with
      // nothing to align to — measured at 430px, label x=12, rail 12→418 and the number cell 284→364, three
      // elements on three different x's down ten consecutive rows, so "which knobs have I set?" (the single
      // most common read on this tab) became ten separate hunts instead of one glance down a column. COST:
      // 148px per row against 38px on desktop, ≈2,800px of scroll for one preset. Pairing the NAME with its
      // VALUE on one line and giving the rail the row beneath restores a right-hand value column — the cell
      // now ends exactly where the rail does — and gives the row back ~46px. The consumer places its own
      // cells into these tracks (`features/preset/components/knob-row.tsx`); this recipe owns only the
      // tracks, exactly as the wide arm does.
      //
      // `grid-flow-row-dense` IS THE MECHANISM, and it is not an optimisation. Every knob in a cluster is a
      // cell of ONE grid (the rows are fragments — that is what makes the name column shared), so a row
      // cannot be addressed by index: an explicit `row-start-1` would put TEN value cells on the first line.
      // Dense packing gives the right answer from DOM order alone — the name takes the next free cell, the
      // rail's `col-span-2` forces the line below it, and the value cell BACKFILLS the hole beside the name
      // that the rail skipped. It is the one placement that survives a gloss row appearing on some knobs and
      // not others, because it is derived per item rather than counted. It is scoped to the FOLDED arm and
      // must stay there: measured, an unscoped `grid-flow-row-dense` backfills the wide arm's next NAME cell
      // into the hole the gloss's `col-start-2` leaves at column one, which put a cluster's explainers on
      // two different x's (398,398,398,966,966) — the very column P3 exists to hold.
      knob: "grid-cols-[1fr_max-content] @max-cq-32:grid-flow-row-dense @cq-32:grid-cols-[minmax(var(--width-label-col),max-content)_1fr_max-content]",
      // Four ordered action homes. A wide container keeps the explicit four-track row (`1fr` at the third
      // home is the spacer that pushes the last two right).
      //
      // BELOW `@cq-28` THE ARM IS FLEX-WRAP, NOT A SECOND GRID (#531, measured 2026-08-23). The old narrow arm
      // was a fixed `[1fr_auto]` 2×2 (plus a `@max-xs` third row the consumer placed by hand), so it spent a
      // whole extra 48px row + its gap at EVERY container below 768px — including containers where all four
      // homes provably fit on one line (measured: the chat composer needs 372px of homes and has 392px at a
      // 430px phone, yet rendered two rows). A breakpoint cannot know whether the homes fit; wrapping does.
      // So the narrow arm packs by FIT: one row while the homes fit, a second only when they do not, and no
      // third row at all. The consumer keeps ordering the wrapped lines with its own auto margins — the
      // placement law (which home sits where) belongs to the bar, not to this recipe.
      actionBar: "grid-cols-[auto_auto_1fr_auto] items-center @max-cq-28:flex @max-cq-28:flex-wrap",
    },
    align: ALIGN,
  },
  defaultVariants: { cols: "auto" },
});

/** `size` must stay on the `--container-cq-*` token scale, never raw widths. */
export const containerVariants = tv({
  base: "@container",
  variants: {
    size: { sm: "max-inline-cq-24", md: "max-inline-cq-32", lg: "max-inline-cq-48" },
    cap: CAP,
    scroll: SCROLL,
    width: WIDTH,
    centred: CENTRED,
    grow: GROW,
    fill: FILL,
    paddingInline: PADDING_INLINE,
    ground: GROUND,
  },
});

export const toolbarVariants = tv({
  base: "flex flex-row items-center gap-row px-block block-(--size-control-md)",
});

// Meets the touch floor via h-control-sm, pointer-conditional (44px coarse/unknown, 32px fine).
export const toolbarButtonVariants = tv({
  base: `
    inline-flex items-center justify-center gap-field rounded-control text-label leading-label text-foreground select-none block-(--size-control-sm)
    min-inline-(--size-control-sm)
    hover:bg-accent
    focus-visible:outline-none
    ${DISABLED_STATE_NATIVE}
    ${FOCUS_RING}
  `,
});

export const toolbarSeparatorVariants = tv({
  base: "self-stretch bg-border inline-px",
});

// A Group is a LAYOUT + SEMANTICS box inside the strip (Base UI gives it the group role wiring and a
// `disabled` that cascades to its items): tighter than the strip's own `gap-row` so a related cluster
// reads as one unit against its neighbours.
export const toolbarGroupVariants = tv({
  base: "flex flex-row items-center gap-field data-disabled:opacity-disabled",
});

// The trailing metadata link ("Edited 51m ago"). Label type, muted until hover — it is a toolbar ITEM
// (roving tabindex), so it carries the same focus ring as ToolbarButton, not a bare underline.
export const toolbarLinkVariants = tv({
  base: `
    inline-flex items-center rounded-control px-field ${CAPTION} no-underline block-(--size-control-sm)
    hover:text-foreground
    focus-visible:outline-none
    ${FOCUS_RING}
  `,
});

// Wears the shared field-control box so an input inside a toolbar matches every other text control.
// Use ONE per horizontal toolbar and place it LAST — left/right arrows drive both the text caret and
// the roving tabindex (Base UI's own usage guideline, https://base-ui.com/react/components/toolbar, "Usage guidelines").
export const toolbarInputVariants = tv({
  base: `
    rounded-control border border-input-border bg-field-fill px-field text-body leading-body text-foreground block-(--size-control-sm) min-inline-0
    placeholder:text-muted-foreground
    focus-visible:outline-none
    ${DISABLED_STATE_NATIVE}
    ${FOCUS_RING}
  `,
});
