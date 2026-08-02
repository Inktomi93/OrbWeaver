import { DISABLED_STATE, FOCUS_RING_HAS, tv } from "#lib";

// The slider skin. The control row is h-control-sm so the drag surface meets the ≥44px touch
// floor (§4b axis 3); the visible track stays h-field. Base UI positions Indicator/Thumb inline.
// The header row carries the optional Label + Value readout above the control.
export const sliderVariants = tv({
  slots: {
    root: `flex w-full flex-col gap-field ${DISABLED_STATE}`,
    header: "flex w-full items-baseline justify-between gap-row",
    label: "text-label font-medium leading-label text-foreground",
    value: "text-label leading-label text-muted-foreground tabular-nums",
    control: "flex h-control-sm w-full touch-none select-none items-center",
    // Base UI sets data-invalid on Track (and Control/Thumb) when wrapped in an invalid <Field>
    // (FieldRootState) — the track fill is the visible surface, so it carries the destructive skin.
    track: "relative h-field w-full grow overflow-hidden rounded-full bg-input data-invalid:bg-destructive/20",
    indicator: "rounded-full data-invalid:bg-destructive",
    thumb: [
      // Base UI's Thumb is a decorative div wrapping the real (visually-clipped) native range input and
      // stamps its focus state as `data-focused` — but ONLY when wrapped in a Field.Root (else setFocused
      // is a no-op, so `:focus-visible`/`data-focused` on the thumb never matches for a bare Slider). Key
      // the ring off the nested input's own focus-visible via :has() so EVERY slider rings on keyboard
      // focus (WCAG 2.4.7), Field-wrapped or not (focus-ring.ts _HAS is exactly this shape).
      "size-slider-thumb rounded-full border border-border",
      "transition-shadow duration-(--motion-fast) ease-out-expo",
      "outline-none",
      FOCUS_RING_HAS,
      "data-invalid:border-destructive",
    ],
  },
  // `tone` is the INHERITED-vs-EXPLICIT axis (preset-surface-redesign.md §4.1/§13, the Badge/Switch `tone`
  // precedent). COLOR ONLY — the box (control height, track height, thumb size) stays on the base slots, so
  // a tone can never fight the geometry the touch floor rides on.
  //
  // `default` is the standalone slider's skin: the ember `--primary` fill + the full-weight `--foreground`
  // thumb — the ONE sanctioned accent control on a surface that shows a single slider.
  //
  // `neutral` and `ghost` are the KnobRow pair, and both drop the accent (side-eye F-09, 2026-08-02):
  //  · `neutral` = EXPLICIT. §4.1 rations the ember to focus + the pane's one primary, so a set knob is
  //    signalled by WEIGHT (a 45%-foreground fill + the full-weight thumb — the mock's own explicit row),
  //    not by accent; twelve ember fills in one column was the CD3 budget break the review measured.
  //  · `ghost` = INHERITED, and it paints NO FILL AT ALL. A dimmed fill still draws a bar from the rail's
  //    start to the thumb, so an unset Top-P at its 1.00 model default rendered a FULL grey meter and read
  //    as MORE set than the explicit rows beside it. Bare rail + a muted thumb sitting at the resolved
  //    effective value keeps the datum legible while carrying no magnitude claim.
  variants: {
    tone: {
      default: { indicator: "bg-primary", thumb: "bg-foreground" },
      neutral: { indicator: "bg-foreground/45", thumb: "bg-foreground" },
      ghost: { indicator: "bg-transparent", thumb: "bg-muted-foreground" },
    },
  },
  defaultVariants: { tone: "default" },
});
