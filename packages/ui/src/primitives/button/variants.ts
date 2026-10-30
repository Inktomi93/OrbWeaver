import type { ClassValue, VariantProps } from "tailwind-variants";
import {
  CARD_CORNERS,
  CONTROL_INLINE,
  CONTROL_MIN_BLOCK,
  CONTROL_SIZE,
  CONTROL_SIZES,
  DISABLED_STATE,
  DISABLED_STATE_NATIVE,
  FOCUS_RING,
  FOCUS_RING_INSET,
  FOCUS_RING_NONE,
  FOCUS_RING_ON_SIDEBAR,
  FOCUS_RING_ON_STATE_RING,
  HIDDEN_AT,
  HOVER_REVEAL,
  INKS,
  SELECTED_FILL,
  SELECTION_RAIL,
  SELECTION_RAIL_TONE,
  TONE_ARMS,
  TOUCH_FLOOR_AT_COARSE,
  TOUCH_TARGET_PSEUDO,
  TOUCH_TARGET_PSEUDO_STRETCH,
  tv,
} from "#lib";
import type { Tone } from "#tokens";
import type { BUTTON_SIZE_OVERFLOW } from "./size-hit-area.ts";

// The size axis is the D336 control scale (CONTROL_SIZE, shared with Toggle), plus the boxes that are not a scale step
// until step four of the css-system plan names their components: `media`, `inline` and the `glyph-*` ramp. The size
// axis is the SOLE owner of the box: no other variant and no call-site class may set a height, because a second height
// resolves last-wins and a call-site class would silently beat the sealed box. `square` and `wrap` reshape a scale step
// from that step's own height. The arms that step OUTSIDE the scale (`inline`, `glyph-*`) owe their own hit-area
// ::before — the box shrinks, the touch target does not.
/** One step of the `glyph-*` ramp: a square display box (never a control height, never pointer-narrowed)
 *  plus the hit-area ::before that carries the pointer-conditional touch floor the box itself is under.
 *  `shrink-0` is part of the SIZE promise, not a call-site layout choice — every one of these lives in a
 *  flex row, and a square that shrinks is no longer the box the token names. The step class is passed as a
 *  WHOLE literal from each arm below so Tailwind's scanner still sees it (it never assembles class names).
 *
 *  THE HIT AREA IS `::before`, AND IT HAD TO MOVE (#1843). It was an `::after`, and so is the primary CTA's
 *  gradient ring (`globals.css [data-slot="button"][data-cta]::after`) — which is UNLAYERED, so it beat
 *  these utilities outright: on a `data-cta` glyph button the one `::after` painted the ring at `inset: 0`
 *  with `pointer-events: none`, and the touch target vanished entirely (measured: a 16px hit at a fine
 *  pointer where the ghost twin kept 28). One pseudo cannot be both a brand mark and a tap surface.
 *  `::before` is the house home for this anyway — `TOUCH_TARGET_PSEUDO` (lib/selection-control.ts) has
 *  always lifted checkbox/radio/switch there, and Button was the outlier. */
function glyphBox(box: string): string[] {
  return [box, "relative shrink-0 p-0", TOUCH_TARGET_PSEUDO];
}

function inlineBox(typeStep: string): string[] {
  return ["relative block-auto min-block-0 justify-start font-normal", typeStep, TOUCH_TARGET_PSEUDO_STRETCH];
}

// The pressed tint of a fill-less style: the tone's tint-active fill under its on-tint ink.
const TONE_TINT_HOVER = "hover:bg-tone-tint-active hover:text-tone-text-on-tint";

export const buttonVariants = tv({
  base: [
    "inline-flex items-center justify-center gap-field font-sans font-medium whitespace-nowrap select-none",
    // Tailwind v4 `scale-*` sets the standalone `scale` CSS property, not the transform matrix, so the
    // transition must name `scale` — `transition-[...transform]` would not animate it.
    "transition-[scale] duration-(--motion-fast) ease-out-expo active:scale-95",
    "outline-none",
    FOCUS_RING,
    DISABLED_STATE_NATIVE,
    DISABLED_STATE,
    "aria-busy:cursor-progress",
  ],
  variants: {
    // THE FILL STYLE (D336), painted only with the roles of the stamped tone, so every tone works with every style.
    variant: {
      // A disabled solid drops its fill for the neutral muted pair (a half-opacity fill read as nearly enabled).
      // A busy (`loading`) button is disabled too but is working, so it keeps its fill; `primitives.css` quiets its ring to match.
      solid: [
        "bg-tone-solid text-tone-foreground hover:bg-tone-solid-hover active:bg-tone-solid-active",
        "disabled:not-aria-busy:bg-muted disabled:not-aria-busy:text-muted-foreground disabled:not-aria-busy:shadow-none",
        "data-disabled:not-aria-busy:bg-muted data-disabled:not-aria-busy:text-muted-foreground data-disabled:not-aria-busy:shadow-none",
      ],
      // The resting hairline: a secondary action, or a filter chip in a wrapping rail, where the drawn edge is what
      // makes the pill radius read at all.
      outline: `border border-tone-edge bg-transparent text-tone-text ${TONE_TINT_HOVER}`,
      ghost: `text-tone-text ${TONE_TINT_HOVER}`,
      // An ACTION SPELLED AS A LINK: an underlined run inside prose or a gloss line that
      // does something in place. Navigation is an anchor, not this. No fill at any state, because a link-shaped
      // control that grows a box on hover is a button pretending; the hover is the ink, the press the scale.
      // The hover and press steps take the on-tint ink, one step nearer the page ink, so the link brightens against the page.
      link: "bg-transparent text-tone-text underline hover:text-tone-text-on-tint active:text-tone-text-on-tint",
      // A button that wraps a picture (a portrait, a band of art) and draws nothing of its own: no fill at any
      // state, so the art stays the affordance; it dims a step on hover instead of gaining a tint. Step four of the
      // css-system plan moves it to `PictureButton` (`docs/work/1421-build-the-tone-role-tier-and-one-variant.md`).
      bare: "cursor-pointer bg-transparent text-current hover:opacity-80",
    },
    tone: TONE_ARMS,
    // The focal action under CD3: the CTA lift and, through `data-cta`, the gradient ring. `Button` resolves it on for
    // a solid primary unless the call site passes `focal={false}`.
    focal: { true: "shadow-cta hover:shadow-cta-glow", false: "" },
    size: {
      ...CONTROL_SIZE,
      // CONTENT-SIZED: the child IS the control (a portrait/media trigger). Every scale step pins a control height, so a
      // display-token child larger than it (`size-(--size-avatar-hero)`, 64px) would paint OUTSIDE its own button while
      // the real hit target stayed the step's box. The child owns the touch floor here (an avatar-hero portrait clears it
      // by 20px). Step four of the css-system plan moves it to `PictureButton`.
      media: "p-0 block-auto inline-auto",
      // INLINE: the DISPLAY-AT-REST arm — a datum/line of prose that is also the click target (a tracker
      // value, a beat line, a card row, a roster name). It wears NO control box: text-height, start-aligned,
      // regular weight, so it reads as the text it stands in for and the click-to-edit swap is pixel-stable.
      // It was 13 call sites of `!h-auto min-h-0 !py-0 font-normal` — an `!important` escape from the sealed
      // control height, which is also how they escaped the `ui-size-via-variant` gate (it reads `h-auto`,
      // not `!h-auto`). MEASURED, not assumed (twMerge 3.6, PRE-#146): custom-token spacing/height utilities
      // were unclassifiable — `twMerge("h-(--size-control-sm)","h-auto")` kept BOTH, so those call sites resolved by
      // stylesheet order, i.e. luck (the `media`/TabsTab-`stacked` precedent). #146 registered the
      // spacing scale; that pair now resolves last-wins, and the `!` on the surviving escapes is inert.
      // The arm still sets NO padding at all: preflight already zeroes it, and the call site is the only
      // place that knows what the datum sits in.
      // Padding is the call site's — px-field/py-row/none — and needs no `!` because nothing fights it.
      // TOUCH FLOOR BY CONSTRUCTION: a text-height button is ~18px tall, so the arm carries its own hit-area
      // pseudo (the TOUCH_TARGET_PSEUDO idea on `::before`, stretched to the button's own width rather than
      // square) sized on `--size-touch-target` — the POINTER-CONDITIONAL token: ≥44px on coarse/unknown
      // pointers, 28px on fine. Layout-neutral (absolutely positioned), so the datum's box is unchanged.
      // It is `::before` for the #1843 reason spelled out on `glyphBox` above: the CTA ring owns `::after`
      // unlayered, so an `inline` PRIMARY button's hit area was being replaced by a ring that cannot be
      // clicked.
      inline: inlineBox("text-label leading-label"),
      // A recovery action inside body prose must keep that sentence's type step and the same touch target.
      "inline-body": inlineBox("text-body leading-body"),
      // GLYPH: the SQUARE ICON-ONLY MICRO-BUTTON ramp — the `square` box's sub-control twin. A `square` button is a
      // full scale step (a toolbar button that happens to hold a glyph); a glyph button rides INSIDE a dense
      // row — a badge's dismiss, a list row's trailing delete, an editor row's toggle strip — where a control
      // height would be taller than the thing it hangs off. It was 13 call sites of
      // `<Button variant="ghost" size="sm" className="!size-N !p-0">` at four scales, i.e. an `!important`
      // escape from the sealed `sm` control height, which is also how they escaped the `ui-size-via-variant`
      // gate for a day (it read `size-6`, not `!size-6`). A className CANNOT express this: `size-(--size-control-sm)`
      // was a custom token, opaque to tailwind-merge (`twMerge("size-(--size-control-sm)","size-6")` kept BOTH), so
      // those sites resolved by stylesheet order — with `!important` bolted on to force the coin flip (#146
      // registered the scale, so that pair now resolves last-wins and the `!` is inert). The
      // `media` / `inline` precedent.
      //
      // The box is a POINTER-INDEPENDENT display size (`--spacing-glyph-*`, the avatar/checkbox/slider-thumb
      // family): it never narrows, because it is already below every control step. Which means it is below the
      // tap floor at three of its four steps, so EVERY arm carries the `inline` arm's hit-area pseudo — a
      // square `size-(--size-touch-target)` ::before, centered and absolutely positioned, so the visible glyph box is
      // unchanged while the real hit target is the pointer-conditional touch token. Before this arm those 13
      // sites had NO hit area at all beyond their 16–24px box.
      //
      // Four steps, not one: the sweep is geometry-PRESERVING (`done ≠ rendered` — resizing 13 live controls
      // is a design change, not a gate fix), and the four scales are four real roles the token descriptions
      // name.
      "glyph-xs": glyphBox("size-(--size-glyph-xs)"),
      "glyph-sm": glyphBox("size-(--size-glyph-sm)"),
      "glyph-md": glyphBox("size-(--size-glyph-md)"),
      "glyph-lg": glyphBox("size-(--size-glyph-lg)"),
    } satisfies Record<keyof typeof BUTTON_SIZE_OVERFLOW, ClassValue>,
    // ICON-ONLY: the step's height as its width too, with no inline padding beside the glyph. `shrink-0` for the
    // `glyphBox` reason: a square that shrinks in a crowded row is no longer its step's box, and at a coarse pointer it
    // falls under the tap floor. The width per step is a compound below.
    square: { true: "shrink-0 p-0", false: "" },
    // MULTILINE: a choice carrying a model-authored sentence. The label wraps over the base's nowrap and the height
    // follows the wrapped text, floored at the step's height (a compound below) so it never drops under the tap floor.
    // The tight inset keeps one line inside every step's height at a fine pointer, so a one-line wrap sits level with
    // its row; a larger inset outgrows the `chip` and `md` steps by a pixel or two.
    wrap: { true: "py-tight whitespace-normal block-auto", false: "" },
    // THE RADIUS AXIS (added 2026-08-16, program #102). It used to live in `base` as a bare
    // `rounded-control`, which made a pill button UNSPELLABLE from a call site: `rounded-control` is a
    // custom `--radius-*` token, so tailwind-merge cannot classify it and `cn("rounded-control",
    // "rounded-full")` keeps BOTH — the winner decided by stylesheet order, i.e. luck (the same
    // unclassifiable-custom-token trap the `media`/`wrap`/`inline` size arms document). Moving it onto a
    // variant makes the choice a declaration instead of a coin flip; the default is byte-identical to
    // what `base` emitted.
    shape: {
      /** The standard control box — every button that is a button. */
      control: "rounded-control",
      /** A PILL — a destination/filter chip in a wrapping rail, where the full radius is what says "this
       *  is one of many small things to skim" rather than "this is a control to operate". */
      pill: "rounded-full",
    },
    // A button that covers a part flush in a card's corners (art, a welded portrait) traces those corners, so its
    // focus ring follows the card. Declared after `shape`, whose control radius it refines corner by corner.
    cardCorners: CARD_CORNERS,
    // A named ink for a fill-less style (D336); `Button` resolves `inherit` for a neutral ghost or link, which takes its
    // host's ink. An outline draws its own box, so it keeps its tone's text role.
    // Declared before `selection`, so a selected arm's own ink wins the merge.
    ink: INKS,
    // THE SELECTION STATE LAYER (added 2026-08-17, program #102 variant B). Toggle already owns this
    // reading on `data-pressed` — but a TRI-STATE filter (off → include → exclude → off) cannot be a
    // Toggle: `aria-pressed` has two values and a third state announced through it would be a lie. So the
    // one control class that needs the reading most had no route to it, and the two live sites spelled it
    // as call-site classNames (`inset-ring-2 inset-ring-ring` / `… inset-ring-destructive line-through`) —
    // a skin decided in a feature, which is how two rails drift.
    //
    // DECLARED AFTER `variant` ON PURPOSE: tv() emits variant classes in key
    // order, so these must come last for tailwind-merge to resolve `bg-*`/`border-*`/`text-*` in the
    // state's favour over the resting style's.
    //
    // The `on` arm is SELECTED_FILL, Toggle's `data-pressed` skin as a static arm, so a selected scope toggle
    // and a selected tag chip in one rail read the same. It is a fill, not a ring: keyboard focus owns the ring.
    // `negated` wears the same fill, so both set states read as one family against `off`, plus its own state ring.
    selection: {
      /** Not selected — the resting `variant` skin stands alone, focus ring included. */
      none: "",
      /** IN the set. */
      on: `border-transparent ${SELECTED_FILL}`,
      /** SUBTRACTED from the set — the exclusion arm of a tri-state facet. It carries BOTH a hue and a
       *  strike because the state must never rest on colour alone (a red ring and an ember ring are one
       *  ring to a red-blind reader); the strike says "not this one" on its own. */
      negated: `border-transparent ${SELECTED_FILL} line-through inset-ring-2 inset-ring-destructive ${FOCUS_RING_ON_STATE_RING}`,
      /** A row in a list of rows (a facet in an editor's index): the start rail and tint mark the one keyed on
       *  `data-selected`, and the rail box is reserved at rest so selecting never shifts the row. */
      rail: SELECTION_RAIL,
    },
    hiddenAt: HIDDEN_AT,
    reveal: HOVER_REVEAL,
    // A glyph-only chip is narrower than the touch floor at a coarse pointer; its `sm` height already clears it.
    touchFloor: { inline: TOUCH_FLOOR_AT_COARSE.inline },

    // A dotted underline marks an action that discloses more of the same view (show all tags), not one that leaves.
    underline: { none: "", dotted: "underline decoration-dotted" },
    // A text-height control that swaps with an edit field reserves the field's 1px edge, so the swap does not shift.
    reserveEdge: { true: "border border-transparent", false: "" },
    // The accent ring for the moment a change this control made has landed (a portrait just replaced).
    confirming: { true: "ring-2 ring-accent", false: "" },
    // A disabled control that teaches by its label stays at full strength; its state reads from the copy beside it.
    quietDisabled: { true: "disabled:opacity-100 data-disabled:opacity-100", false: "" },
    // Scrollport-bound controls keep the ring inside their box instead of clipping an outer moat.
    focusRing: { surface: "", sidebar: FOCUS_RING_ON_SIDEBAR, inset: [FOCUS_RING_NONE, FOCUS_RING_INSET] },
  },
  // A square's width and a wrap's floor are the scale step's own height; the other boxes take neither.
  compoundVariants: CONTROL_SIZES.flatMap((size) => [
    { size, square: true, class: CONTROL_INLINE[size] },
    { size, wrap: true, class: CONTROL_MIN_BLOCK[size] },
  ]),
  defaultVariants: {
    variant: "solid",
    size: "md",
    square: false,
    wrap: false,
    shape: "control",
    selection: "none",
    underline: "none",
    reserveEdge: false,
    confirming: false,
    quietDisabled: false,
    focusRing: "surface",
  },
});

export type ButtonVariant = keyof typeof buttonVariants.variants.variant;

/** The tone a style takes when the call site names none: the solid and the link are the primary action and its
 *  inline twin; an edge, a ghost and a picture stay neutral, so they read as quieter than the region's one CTA. */
export const BUTTON_DEFAULT_TONE = {
  solid: "primary",
  outline: "neutral",
  ghost: "neutral",
  link: "primary",
  bare: "neutral",
} as const satisfies Record<ButtonVariant, Tone>;

/**
 * The D336 tone a button's roles resolve against. A selected row on a selection rail takes the primary rail it paints:
 * the owner-ratified selection idiom keeps one colour, so a fill-less rail row's tone yields to it while selected and
 * rests in its own tone.
 */
export function buttonTone(variant: ButtonVariant, tone: Tone, selection: VariantProps<typeof buttonVariants>["selection"], selected: boolean): Tone {
  return selection === "rail" && selected && variant !== "solid" ? SELECTION_RAIL_TONE : tone;
}
