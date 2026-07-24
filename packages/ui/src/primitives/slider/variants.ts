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
    indicator: "rounded-full bg-primary data-invalid:bg-destructive",
    thumb: [
      // Base UI's Thumb is a decorative div wrapping the real (visually-clipped) native range input and
      // stamps its focus state as `data-focused` — but ONLY when wrapped in a Field.Root (else setFocused
      // is a no-op, so `:focus-visible`/`data-focused` on the thumb never matches for a bare Slider). Key
      // the ring off the nested input's own focus-visible via :has() so EVERY slider rings on keyboard
      // focus (WCAG 2.4.7), Field-wrapped or not (focus-ring.ts _HAS is exactly this shape).
      "size-slider-thumb rounded-full border border-border bg-foreground",
      "transition-shadow duration-(--motion-fast) ease-out-expo",
      "outline-none",
      FOCUS_RING_HAS,
      "data-invalid:border-destructive",
    ],
  },
});
