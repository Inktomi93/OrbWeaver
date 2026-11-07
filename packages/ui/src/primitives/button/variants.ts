import type { ClassValue, VariantProps } from "tailwind-variants";
import {
  CARD_CORNERS,
  CONTROL_INLINE,
  CONTROL_MIN_BLOCK,
  CONTROL_SIZE,
  CORNER,
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
  TONE_OUTLINE,
  TONE_TINT_HOVER,
  TOUCH_FLOOR_AT_COARSE,
  tv,
} from "#lib";
import type { Tone } from "#tokens";
import type { BUTTON_BOX_OVERFLOW } from "./box-hit-area.ts";

// The button family's one recipe: the fill style, tone and state axes every button paints through `ButtonCore`, plus
// Button's own box, the D336 control scale. A box that is not a scale step is a named component with its own recipe
// (`GlyphButton`, `InlineAction`, `PictureButton`), so neither `size` nor `variant` has a default here: a named
// component that passes neither draws no Button box and no Button style. `Button` resolves both defaults itself.
// The size axis is the sole owner of Button's box: a call-site class cannot reliably beat a custom-token height.

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
    corner: CORNER,
    // A button that is a row's door: it takes the room left beside its siblings and sets its label at the start.
    // `line` is a whole list line: the full width and the field inset, its text set at the start.
    stretch: { row: "flex-1 justify-start min-inline-0", line: "px-field text-start inline-full" },
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
      outline: `${TONE_OUTLINE} ${TONE_TINT_HOVER}`,
      ghost: `text-tone-text ${TONE_TINT_HOVER}`,
      // An ACTION SPELLED AS A LINK: an underlined run inside prose or a gloss line that
      // does something in place. Navigation is an anchor, not this. No fill at any state, because a link-shaped
      // control that grows a box on hover is a button pretending; the hover is the ink, the press the scale.
      // The hover and press steps take the on-tint ink, one step nearer the page ink, so the link brightens against the page.
      link: "bg-transparent text-tone-text underline hover:text-tone-text-on-tint active:text-tone-text-on-tint",
    },
    tone: TONE_ARMS,
    // The focal action under CD3: the CTA lift and, through `data-cta`, the gradient ring. `ButtonCore` resolves it on
    // for a solid primary unless the call site passes `focal={false}`.
    focal: { true: "shadow-cta hover:shadow-cta-glow", false: "" },
    size: CONTROL_SIZE satisfies Record<keyof typeof BUTTON_BOX_OVERFLOW.button, ClassValue>,
    // ICON-ONLY: the step's height as its width too, with no inline padding beside the glyph. `shrink-0` because a
    // square that shrinks in a crowded row is no longer its step's box, and at a coarse pointer it falls under the tap
    // floor. The width per step is a compound below.
    square: { true: "shrink-0 p-0", false: "" },
    // MULTILINE: a choice carrying a model-authored sentence. The label wraps over the base's nowrap and the height
    // follows the wrapped text, floored at the step's height (a compound below) so it never drops under the tap floor.
    // The tight inset keeps one line inside every step's height at a fine pointer, so a one-line wrap sits level with
    // its row; a larger inset outgrows the `chip` and `md` steps by a pixel or two.
    wrap: { true: "py-tight whitespace-normal block-auto", false: "" },
    // THE RADIUS AXIS. A radius on the base would make a pill unspellable from a call site: `rounded-control` is a
    // custom `--radius-*` token tailwind-merge cannot classify, so a call-site `rounded-full` would keep both and win by
    // stylesheet order.
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
    // A named ink for a fill-less style (D336); `ButtonCore` resolves `inherit` for a neutral ghost or link, which takes
    // its host's ink. An outline draws its own box, so it keeps its tone's text role.
    // Declared before `selection`, so a selected arm's own ink wins the merge.
    ink: INKS,
    // THE SELECTION STATE LAYER. A tri-state filter (off → include → exclude → off) cannot be a Toggle: `aria-pressed`
    // has two values, and a third state announced through it would be a lie.
    //
    // DECLARED AFTER `variant` ON PURPOSE: tv() emits variant classes in key order, so these must come last for
    // tailwind-merge to resolve `bg-*`/`border-*`/`text-*` in the state's favour over the resting style's.
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
      negated: `border-transparent ${SELECTED_FILL} line-through inset-ring-(length:--border-width-rule) inset-ring-destructive ${FOCUS_RING_ON_STATE_RING}`,
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
    confirming: { true: "ring-(length:--border-width-rule) ring-accent", false: "" },
    // A disabled control that teaches by its label stays at full strength; its state reads from the copy beside it.
    quietDisabled: { true: "disabled:opacity-100 data-disabled:opacity-100", false: "" },
    // Scrollport-bound controls keep the ring inside their box instead of clipping an outer moat.
    focusRing: { surface: "", sidebar: FOCUS_RING_ON_SIDEBAR, inset: [FOCUS_RING_NONE, FOCUS_RING_INSET] },
  },
  // A square's width and a wrap's floor are the scale step's own height; the other boxes take neither.
  compoundVariants: [
    { size: "chip", square: true, class: CONTROL_INLINE.chip },
    { size: "sm", square: true, class: CONTROL_INLINE.sm },
    { size: "md", square: true, class: CONTROL_INLINE.md },
    { size: "lg", square: true, class: CONTROL_INLINE.lg },
    { size: "chip", wrap: true, class: CONTROL_MIN_BLOCK.chip },
    { size: "sm", wrap: true, class: CONTROL_MIN_BLOCK.sm },
    { size: "md", wrap: true, class: CONTROL_MIN_BLOCK.md },
    { size: "lg", wrap: true, class: CONTROL_MIN_BLOCK.lg },
  ],
  defaultVariants: {
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
 *  inline twin; an edge and a ghost stay neutral, so they read as quieter than the region's one CTA. A button family
 *  member that draws no style (a picture) is neutral too. */
export const BUTTON_DEFAULT_TONE = {
  solid: "primary",
  outline: "neutral",
  ghost: "neutral",
  link: "primary",
} as const satisfies Record<ButtonVariant, Tone>;

/**
 * The D336 tone a button's roles resolve against. A selected row on a selection rail takes the primary rail it paints:
 * the owner-ratified selection idiom keeps one colour, so a fill-less rail row's tone yields to it while selected and
 * rests in its own tone.
 */
export function buttonTone(
  variant: ButtonVariant | undefined,
  tone: Tone,
  selection: VariantProps<typeof buttonVariants>["selection"],
  selected: boolean,
): Tone {
  return selection === "rail" && selected && variant !== "solid" ? SELECTION_RAIL_TONE : tone;
}
