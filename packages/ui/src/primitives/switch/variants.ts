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
// THE BORDER IS ARITHMETIC, NOT JUST PAINT (#424, closing side-eye #420 P3). The root is `border-box`,
// so its CONTENT box — the box the thumb is laid out and translated in — is 2× the border narrower than
// `--spacing-switch-track`. A travel of `track − thumb` spends the FULL token and parked the checked
// thumb one border-width PAST the right rim (measured insetRight −1 at both pointers). So the travel
// subtracts the border twice, and the root spells its own border WIDTH from the same
// `--border-width-control` token that the calc reads — geometry and paint cannot drift apart. Arithmetic:
// fine 48 − 32 − 2×1 = 14, coarse 64 − 32 − 2×1 = 30 (the coarse pin computes exactly that). The root's
// border COLOUR is untouched: `border-border` and the `data-invalid:` / `data-checked:` colour variants
// (and the CT that reads `border-top-color`) ride the colour axis, which the width spelling never names.
// Pinned both ways in tests/ui/primitives/switch/switch.ct.tsx — the rim pin asserts the thumb's gap to
// each rim EQUALS the root's own rendered border width, at both pointers, so a border retune moves the
// expectation with the design instead of freezing 1px.
//
// RESIDUAL, deliberately unchanged: the thumb is exactly as tall as the root at a fine pointer
// (`h-switch-thumb` both), so it is flush with the root's OUTER box vertically (measured top/bottom
// inset 0) while now sitting a border in from each end horizontally. Inset-ing it vertically would mean
// shrinking the display thumb, a size decision this fix has no mandate for.
//
// THE QUIET STATE IS THE QUIET ONE — the OFF THUMB's ink, not its geometry (#1090; side-eye F10/E3
// 2026-08-30, re-measured 2026-09-02 and machine-detected by `design-audit`'s `quiet-state` P2 in every
// appearance/theme/pane arm: "OFF 12.58:1 vs ON 7.06:1"). The thumb was `bg-foreground` — the page's
// brightest ink, opaque, 32 of the track's 48px — while the track is a 12% overlay compositing to
// 1.41:1. So the OFF switch's loudest object measured 11.118:1 (CT framebuffer, Hearth over `bg-card`)
// against a 7.056:1 ON state: the surface spent its loudest register on the state that carries NO
// information — six near-white pills that mean "off". NOT snap's number: `snap --contrast` on
// `[data-slot=switch-thumb]` reads the element's INK (`getComputedStyle().color`), which on the thumb is
// the inherited `--color-foreground` and paints nothing — it read 16.26:1 both before and after this
// change, and only matched the fill before because the fill was that same token.
//
// `muted-foreground/80` is the value BOUNDED FROM BOTH SIDES, which is what makes it a measurement
// rather than a taste. CEILING: it must sit under the ON state's loudest member on every seed and both
// pane hosts — including the `quiet` tone, whose deliberately dim checked track has only 3.69:1 to
// spend under Light. FLOOR: WCAG 1.4.11 asks 3:1 of the visual information that identifies a control's
// state, and the OFF knob IS that information. The alpha rides over the TRACK, so the knob composites
// polarity-correctly on a light theme instead of needing a second hand-picked value. Measured
// (theme/pane → OFF loudest, ON accent, ON quiet, and the read-only lock glyph against the thumb):
//   Hearth/bg   4.563 (was 12.701) · 7.437 · 5.610 · 6.157   Hearth/card 4.137 (was 11.235) · 7.056 · 5.967 · 6.311
//   Mocha /bg   4.415 (was 12.351) · 7.375 · 5.562 · 6.070   Mocha /card 3.824 (was 10.425) · 7.285 · 6.008 · 6.229
//   Light /bg   3.560 (was 11.153) · 6.193 · 3.693 · 4.968   Light /card 3.651 (was 11.606) · 6.292 · 3.750 · 4.895
// Both bounds are pinned from the FRAMEBUFFER in tests/ui/primitives/switch/switch.ct.tsx, in all three
// seeds — computed style can see neither the compositing nor the oklch, and a polarity fix proven on
// the dark arm alone is this tree's recorded failure family.
//
// NOT CHANGED HERE, deliberately: the ON skin (the accent track IS the ON signal and already carries
// it), the thumb's SIZE (E3 also asked for "~55% of track height"; `--spacing-switch-thumb` is one
// token doing two jobs — the fine-pointer TRACK HEIGHT and the thumb size — so that is a token split
// plus a second pointer-conditional pair, i.e. its own row, and the RESIDUAL ruling above stands), and
// the `quiet` tone's `foreground/55` checked track (raising it was the other way to fix quiet's Light
// arm; unnecessary once the OFF knob is bounded, so the /70 rejection recorded below survives intact).
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
      "relative inline-flex h-switch-thumb w-switch-track shrink-0 cursor-pointer items-center rounded-full border-(length:--border-width-control) border-border bg-input p-0 pointer-coarse:h-touch-target",
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
      "group relative flex aspect-square h-switch-thumb items-center justify-center rounded-full bg-muted-foreground/80",
      "transition-transform duration-(--motion-fast) ease-out-expo",
      "data-checked:translate-x-[calc(var(--spacing-switch-track)_-_var(--spacing-switch-thumb)_-_2_*_var(--border-width-control))]",
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
