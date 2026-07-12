import { FOCUS_RING, tv } from "#lib";

// The slider skin. The control row is h-control-sm so the drag surface meets the ≥44px touch
// floor (§4b axis 3); the visible track stays h-field. Base UI positions Indicator/Thumb inline.
// The header row carries the optional Label + Value readout above the control.
export const sliderVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field data-disabled:pointer-events-none data-disabled:opacity-50",
    header: "flex w-full items-baseline justify-between gap-row",
    label: "text-label font-medium leading-label text-foreground",
    value: "text-label leading-label text-muted-foreground tabular-nums",
    control: "flex h-control-sm w-full touch-none select-none items-center",
    // Base UI sets data-invalid on Track (and Control/Thumb) when wrapped in an invalid <Field>
    // (FieldRootState) — the track fill is the visible surface, so it carries the destructive skin.
    track:
      "relative h-field w-full grow overflow-hidden rounded-full bg-input data-invalid:bg-destructive/20",
    indicator: "rounded-full bg-primary data-invalid:bg-destructive",
    thumb: [
      "size-section rounded-full border border-border bg-foreground",
      "transition-shadow duration-(--motion-fast) ease-out-expo",
      "outline-none",
      FOCUS_RING,
      "data-invalid:border-destructive",
    ],
  },
});
