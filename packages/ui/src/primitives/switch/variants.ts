import { tv } from "#lib";

// The switch skin. The visible track is switch-thumb (32px) tall × switch-track (48px) wide — dedicated
// pointer-INDEPENDENT display tokens, so the desktop switch stays generous instead of collapsing toward
// a near-square ~4px-travel toggle (owner defect #3: the old h-section × w-touch-target sized the track
// off the pointer-narrowing touch-target, leaving fine-pointer travel = 28px − 24px = 4px). The 32px
// track height also clears the design-audit tap-target hard floor on its own box (Task #76). The ≥44px
// touch floor is met SEPARATELY by the size-touch-target ::before pseudo (coarse), so the visible track
// never has to carry the hit floor. Thumb travel = switch-track − switch-thumb (16px) — an unmistakable
// left↔right slide — PLUS the track/thumb colour flip (hollow bg-input/foreground → filled primary/
// primary-foreground), so on vs off reads at a glance on colour AND position. Token calc, no raw px.
export const switchVariants = tv({
  slots: {
    root: [
      "relative inline-flex h-switch-thumb w-switch-track shrink-0 cursor-pointer items-center rounded-full border border-border bg-input p-0",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-checked:border-primary data-checked:bg-primary data-disabled:pointer-events-none data-disabled:opacity-50",
      // Base UI sets data-invalid on the Root when wrapped in an invalid <Field> (FieldRootState).
      "data-invalid:border-destructive data-invalid:focus-visible:ring-destructive",
      "before:absolute before:top-1/2 before:left-1/2 before:size-touch-target before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
    ],
    thumb: [
      "group relative flex aspect-square h-full items-center justify-center rounded-full bg-foreground",
      "transition-transform duration-(--motion-fast) ease-out-expo",
      "data-checked:translate-x-[calc(var(--spacing-switch-track)-var(--spacing-switch-thumb))] data-checked:bg-primary-foreground",
    ],
    // Read-only signal (A3): hidden by default, shown only when Base UI sets data-readonly on the
    // thumb. Color inverts against whichever thumb bg is live so it stays legible on/off
    // (text-background reads on the dark bg-foreground thumb; text-primary reads on the light
    // bg-primary-foreground thumb) — never the disabled opacity treatment.
    readOnlyIcon:
      "hidden text-background group-data-[readonly]:block group-data-[checked]:text-primary",
  },
});
