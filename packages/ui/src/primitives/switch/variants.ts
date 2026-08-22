import { DISABLED_STATE, FOCUS_RING, FOCUS_RING_DESTRUCTIVE, TOUCH_TARGET_PSEUDO, tv } from "#lib";

// The track is generous rather than collapsing toward a near-square toggle — and BOTH of its dimensions
// are pointer-conditional, because only the pair keeps the silhouette. At a coarse pointer the root grows
// to the ≥44px touch floor on its HEIGHT (`pointer-coarse:h-touch-target`) and `--spacing-switch-track`
// widens to 64px to match (the token's own @media(pointer:fine) override narrows it back to 48 on the
// desktop arm). Height alone was the shipped defect: a 48-wide track around a 32px thumb at 44 tall is a
// 1.091-aspect near-circle with track painting on all four sides of the knob, which side-eye #420 measured
// and read as a crescent moon rather than a switch. The thumb stays on its pointer-independent display
// token, so travel = track − thumb scales with the width (32px coarse / 16px fine) and stays legible at
// both. The pseudo stays as the unknown-pointer fallback, but coarse target geometry no longer depends on
// invisible overflow. Both arms are pinned in tests/ui/primitives/switch/switch.ct.tsx (the fine aspect +
// travel pins, and the `at a COARSE pointer` describe block).
//
// KNOWN, DELIBERATELY UNFIXED (side-eye #420 P3, pre-existing at BOTH pointers): the checked thumb sits
// 1px proud of the track's right rim. The root is `border-box` with a 1px border, so its CONTENT box is
// 2px narrower than `--spacing-switch-track`, while the translate below spends the full token. Every fix
// is bigger than the defect — subtracting the border needs a raw `2px` (banned: tokens only) or a new
// border-width token plus a re-spelling of `border` on the root, whose colour the invalid/checked
// variants and a CT assertion already ride.
//
// `tone` rations the accent (north-star §5 rule 0.5, PP1's Badge `tone` precedent; owner-sanctioned
// 2026-07-16): `accent` (default) is the byte-identical ember-on-checked skin — the ONE sanctioned
// accent toggle per surface. `quiet` swaps the CHECKED track onto the derived neutral ramp
// (`--color-secondary`, a theme-retinted opaque grey — never a raw value), so a rack of per-row
// switches never multiplies the accent regardless of what color a theme resolves `--color-primary` to.
// The on/off signal is NEVER color-alone: the thumb TRAVEL (data-checked translate, untouched) plus the
// shared unchecked `bg-input` track hold a11y state distinctness across BOTH tones without ember.
export const switchVariants = tv({
  slots: {
    root: [
      "relative inline-flex h-switch-thumb w-switch-track shrink-0 cursor-pointer items-center rounded-full border border-border bg-input p-0 pointer-coarse:h-touch-target",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none",
      FOCUS_RING,
      DISABLED_STATE,
      // Base UI sets data-invalid on the Root when wrapped in an invalid <Field> (FieldRootState).
      "data-invalid:border-destructive",
      FOCUS_RING_DESTRUCTIVE,
      TOUCH_TARGET_PSEUDO,
    ],
    thumb: [
      "group relative flex aspect-square h-switch-thumb items-center justify-center rounded-full bg-foreground",
      "transition-transform duration-(--motion-fast) ease-out-expo",
      "data-checked:translate-x-[calc(var(--spacing-switch-track)-var(--spacing-switch-thumb))]",
    ],
    // Hidden by default, shown only via data-readonly. Color inverts against whichever thumb bg is live.
    readOnlyIcon: "hidden text-background group-data-[readonly]:block",
  },
  variants: {
    tone: {
      accent: {
        root: "data-checked:border-primary data-checked:bg-primary",
        thumb: "data-checked:bg-primary-foreground",
        readOnlyIcon: "group-data-[checked]:text-primary",
      },
      // MEASURED, not chosen by taste (side-eye F-08, 2026-08-02): the checked track was `--color-secondary`
      // (L 0.255) while the UNCHECKED `bg-input` (12% white over the card) composites to ≈L 0.286 — ON was
      // DARKER than OFF, so a rack of twelve rows signalled its state with a 10px thumb offset and nothing
      // else (the switch CT's separation pin measures 0.017 on that pair, ~0 for the eye).
      //
      // `foreground/55` is the RENDERED call the review left open ("bg-foreground/70 … your call from the
      // rendered result"): /70 painted six near-WHITE pills that out-shouted the row names they belong to —
      // loudness traded, not fixed — while /55 still measures a ~0.4 separation, far past the pin's 0.15
      // floor. It spends no accent either way, which is this tone's whole reason to exist; the thumb
      // inverts to `background` so it stays visible against the now-bright track (the `accent` arm's own
      // thumb-inversion pattern).
      quiet: {
        root: "data-checked:border-foreground/55 data-checked:bg-foreground/55",
        thumb: "data-checked:bg-background",
        readOnlyIcon: "group-data-[checked]:text-foreground",
      },
    },
  },
  defaultVariants: { tone: "accent" },
});
