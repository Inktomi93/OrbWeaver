import { DISABLED_STATE, DISABLED_STATE_NATIVE, FIELD_CONTROL, FOCUS_RING, FOCUS_RING_DESTRUCTIVE, tv } from "#lib";

// The text-input skin — the shared FIELD_CONTROL box + h-control-sm floor (the ≥44px law, §4b axis 3).
export const inputVariants = tv({
  base: [
    FIELD_CONTROL,
    "h-control-sm",
    "placeholder:text-muted-foreground",
    "transition-colors duration-(--motion-fast) ease-out-expo",
    "outline-none",
    FOCUS_RING,
    DISABLED_STATE_NATIVE,
    DISABLED_STATE,
    "data-invalid:border-destructive",
    FOCUS_RING_DESTRUCTIVE,
  ],
});
