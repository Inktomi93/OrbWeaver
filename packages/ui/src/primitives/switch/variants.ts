import { FOCUS_RING, FOCUS_RING_DESTRUCTIVE, tv } from "#lib";

// The visible track rides pointer-independent display tokens, so the desktop switch stays generous
// rather than collapsing toward a near-square toggle. The ≥44px touch floor is met separately by the
// `before:size-touch-target` pseudo, so the visible track never has to carry the hit floor.
export const switchVariants = tv({
  slots: {
    root: [
      "relative inline-flex h-switch-thumb w-switch-track shrink-0 cursor-pointer items-center rounded-full border border-border bg-input p-0",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none",
      FOCUS_RING,
      "data-checked:border-primary data-checked:bg-primary data-disabled:pointer-events-none data-disabled:opacity-50",
      // Base UI sets data-invalid on the Root when wrapped in an invalid <Field> (FieldRootState).
      "data-invalid:border-destructive",
      FOCUS_RING_DESTRUCTIVE,
      "before:absolute before:top-1/2 before:left-1/2 before:size-touch-target before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
    ],
    thumb: [
      "group relative flex aspect-square h-full items-center justify-center rounded-full bg-foreground",
      "transition-transform duration-(--motion-fast) ease-out-expo",
      "data-checked:translate-x-[calc(var(--spacing-switch-track)-var(--spacing-switch-thumb))] data-checked:bg-primary-foreground",
    ],
    // Hidden by default, shown only via data-readonly. Color inverts against whichever thumb bg is live.
    readOnlyIcon:
      "hidden text-background group-data-[readonly]:block group-data-[checked]:text-primary",
  },
});
