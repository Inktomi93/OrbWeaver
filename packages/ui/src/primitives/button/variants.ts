import { FOCUS_RING, tv } from "#lib";

// The button skin — tokens only (ui-package-design §5; D43 §11.4: no components/ui exemption).
// Sizes ride the control-height tokens, so the ≥44px touch floor holds by construction (§4b axis 3).
export const buttonVariants = tv({
  base: [
    "inline-flex select-none items-center justify-center gap-field whitespace-nowrap rounded-control font-sans font-medium",
    // Micro-interaction press feedback (motion guide §2/§4.2 #4): the surface acknowledges a press with
    // a compositor-only scale-down on `:active` at --motion-fast, released on pointerup. Uses `scale-95`
    // — the house press idiom (overlay-motion + drawer's `data-active:scale-95`); Tailwind v4 doesn't
    // generate a bare `scale-97` utility (it silently drops), so 95 is what actually compiles for the
    // subtle-press intent. NOTE: Tailwind v4 `scale-*` sets the standalone `scale` CSS PROPERTY (not the
    // `transform` matrix), so the transition must name `scale` — `transition-[…transform]` would not
    // animate it (verified via computed style: `scale` = 0.95, `transform` = none under `:active`).
    // Reduced-motion drops it via the globals.css floor (near-zero transition-duration) — REMOVE, not
    // shorten. Disabled/loading never presses (the `disabled:pointer-events-none` / `data-disabled`
    // arms already stop `:active` firing).
    "transition-[color,background-color,box-shadow,scale] duration-(--motion-fast) ease-out-expo active:scale-95",
    "outline-none",
    FOCUS_RING,
    "disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50",
    "aria-busy:cursor-progress",
  ],
  variants: {
    intent: {
      // A static top-highlight (shadow-cta — a light-from-above inset hairline) gives primary a raised,
      // tactile read at rest; hover swaps to shadow-cta-glow (that highlight + the rationed Ember glow)
      // via the existing color transition (no new motion). The press-scale (base) is untouched.
      primary:
        "bg-primary text-primary-foreground shadow-cta hover:bg-primary/90 hover:shadow-cta-glow active:bg-primary/80",
      // D62 P5: `secondary` is BORDERED — a 1px `--color-border` outline over a transparent surface;
      // hover fills `--accent`. NOT a new `outline` intent (P5 keeps the intent set small). The `border`
      // 1px is Tailwind's untokenized default (the dialog/avatar `border border-border` precedent).
      secondary:
        "border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
      // D62 P5: `ghost` defaults MUTED (mockup) — text-muted-foreground at rest, accent on hover.
      ghost:
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
      destructive:
        "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
    },
    size: {
      sm: "h-control-sm px-block text-label leading-label",
      md: "h-control-md px-block text-body leading-body",
      lg: "h-control-lg px-section text-body leading-body",
      icon: "size-control-md p-0",
    },
  },
  defaultVariants: { intent: "primary", size: "md" },
});
