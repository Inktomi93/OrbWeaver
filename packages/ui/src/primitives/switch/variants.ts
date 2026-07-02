import { tv } from "tailwind-variants";

// The switch skin. The visible track is h-section × w-touch-target; the ::before pseudo extends
// the hit area to a full size-touch-target square, so the ≥44px touch floor holds without a giant
// track (§4b axis 3). Thumb travel = touch-target − section (the track/thumb width delta) — token
// math via calc, no raw pixels.
export const switchVariants = tv({
  slots: {
    root: [
      "relative inline-flex h-section w-touch-target shrink-0 cursor-pointer items-center rounded-full border border-border bg-input p-0",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-checked:bg-primary data-disabled:pointer-events-none data-disabled:opacity-50",
      "before:absolute before:top-1/2 before:left-1/2 before:size-touch-target before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
    ],
    thumb: [
      "group relative flex aspect-square h-full items-center justify-center rounded-full bg-foreground",
      "transition-transform duration-(--motion-fast) ease-out-expo",
      "data-checked:translate-x-[calc(var(--spacing-touch-target)-var(--spacing-section))] data-checked:bg-primary-foreground",
    ],
    // Read-only signal (A3): hidden by default, shown only when Base UI sets data-readonly on the
    // thumb. Color inverts against whichever thumb bg is live so it stays legible on/off
    // (text-background reads on the dark bg-foreground thumb; text-primary reads on the light
    // bg-primary-foreground thumb) — never the disabled opacity treatment.
    readOnlyIcon:
      "hidden text-background group-data-[readonly]:block group-data-[checked]:text-primary",
  },
});
