import { FOCUS_RING, FOCUS_RING_DESTRUCTIVE, tv } from "#lib";

// The text-input skin — bg-input/border-border, h-control-sm floor (the ≥44px law, §4b axis 3).
export const inputVariants = tv({
  base: [
    "h-control-sm w-full min-w-0 rounded-control border border-border bg-input px-block text-body leading-body text-foreground",
    "placeholder:text-muted-foreground",
    "transition-colors duration-(--motion-fast) ease-out-expo",
    "outline-none",
    FOCUS_RING,
    "disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50",
    "data-invalid:border-destructive",
    FOCUS_RING_DESTRUCTIVE,
  ],
});
