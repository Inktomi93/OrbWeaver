import { FOCUS_RING, FOCUS_RING_WITHIN, OVERLAY_MOTION, tv } from "#lib";

// Chips render as pills flowing inline with the draft input inside ONE wrapping box (`chips` rides
// `contents` so its children become direct flex items of `inputGroup`, wrapping line-by-line together).
export const comboboxVariants = tv({
  slots: {
    inputGroup: [
      "relative flex min-h-control-sm w-full min-w-0 flex-wrap items-center gap-field rounded-control border border-border bg-input px-field py-field",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      FOCUS_RING_WITHIN,
      "has-data-disabled:pointer-events-none has-data-disabled:opacity-50",
    ],
    chips: "contents",
    chip: [
      "inline-flex items-center gap-field rounded-full bg-secondary py-field pr-field pl-block text-label leading-label text-secondary-foreground outline-none",
      FOCUS_RING,
      "data-disabled:opacity-50",
    ],
    chipRemove: [
      "flex shrink-0 items-center justify-center rounded-full text-secondary-foreground/70 outline-none",
      "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
      "disabled:pointer-events-none disabled:opacity-50",
    ],
    input: ["min-w-24 flex-1 bg-transparent px-field py-field text-body leading-body text-foreground outline-none", "placeholder:text-muted-foreground"],
    positioner: "z-(--z-popover) outline-none",
    popup: [
      "z-(--z-popover) max-h-(--available-height) w-(--anchor-width) overflow-y-auto rounded-card border border-border bg-popover p-field text-popover-foreground",
      OVERLAY_MOTION.anchoredPopup,
    ],
    arrow: "size-row rotate-45 border border-border bg-popover",
    list: "flex flex-col gap-field",
    item: [
      "flex min-h-touch-target cursor-pointer select-none items-center rounded-control px-block py-field text-body leading-body text-foreground outline-none",
      "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    empty: "px-block py-field text-body leading-body text-muted-foreground",
    // Visually collapsed; must stay mounted — never hidden/display:none the Status element.
    status: "sr-only",
  },
});
