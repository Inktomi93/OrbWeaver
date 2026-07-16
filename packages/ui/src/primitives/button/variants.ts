import { ACCENT_HOVER, CONTROL_SIZE, DISABLED_STATE, DISABLED_STATE_NATIVE, FOCUS_RING, tv } from "#lib";

// Sizes ride the control-height tokens (CONTROL_SIZE, shared with Toggle) so the ≥44px touch floor
// holds by construction; button adds an `icon` size on top.
export const buttonVariants = tv({
  base: [
    "inline-flex select-none items-center justify-center gap-field whitespace-nowrap rounded-control font-sans font-medium",
    // Tailwind v4 `scale-*` sets the standalone `scale` CSS property, not the transform matrix, so the
    // transition must name `scale` — `transition-[...transform]` would not animate it.
    "transition-[color,background-color,box-shadow,scale] duration-(--motion-fast) ease-out-expo active:scale-95",
    "outline-none",
    FOCUS_RING,
    DISABLED_STATE_NATIVE,
    DISABLED_STATE,
    "aria-busy:cursor-progress",
  ],
  variants: {
    intent: {
      primary: "bg-primary text-primary-foreground shadow-cta hover:bg-primary/90 hover:shadow-cta-glow active:bg-primary/80",
      secondary: `border border-border bg-transparent text-foreground ${ACCENT_HOVER} active:bg-accent/80`,
      ghost: `text-muted-foreground ${ACCENT_HOVER} active:bg-accent/80`,
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
    },
    size: {
      ...CONTROL_SIZE,
      icon: "size-control-md p-0",
    },
  },
  defaultVariants: { intent: "primary", size: "md" },
});
