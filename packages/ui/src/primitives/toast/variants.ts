import { ACCENT_HOVER, FOCUS_RING_ON_POPOVER, FOCUS_RING_OUTLINE, tv } from "#lib";
import type { Tone } from "#tokens";

export const toastVariants = tv({
  slots: {
    // A fixed overlay keeps content geometry stable; an empty stack must not intercept the page.
    viewport: `
      pointer-events-none fixed inset-e-0 inset-bs-(--dimension-chrome-row) z-(--z-toast) flex flex-col gap-row overflow-y-auto overscroll-contain p-section
      inline-full max-block-(--dimension-shell-notice-cap) max-inline-cq-24
      has-data-[slot=toast-root]:pointer-events-auto
    `,
    root: [
      // `flex` + `gap-row`: the type GLYPH is a sibling of the content column (see `icon`), so meaning is
      // never carried by the border colour alone.
      "pointer-events-auto relative flex gap-row rounded-card border border-border bg-popover p-block text-popover-foreground shadow-overlay inline-full",
      // The transition NAMES ITS THREE PROPERTIES — `transition-all` was a bug, not a shorthand.
      // `outline-*` is interpolable, so `all` faded the focus ring in over `--motion-base`: a keyboard
      // user moving at speed saw a desaturated half-ring at every stop, and the ring is the one thing on
      // this element that must be instant. Naming the set also keeps the animation compositor-friendly.
      // The three are exactly what the motion below needs: `opacity` + `translate` (the enter/exit slide,
      // which is Tailwind v4's `translate` property, NOT `transform`) and `transform` (the swipe-movement
      // vars on this same line). Dropping any one silently kills that half of the motion — see Button's
      // variants for the sibling case where `scale` had to be named for the same reason.
      `
        [transform:translate(var(--toast-swipe-movement-x),var(--toast-swipe-movement-y))] transition-[opacity,transform,translate] duration-(--motion-base)
        ease-out-expo
      `,
      // Enter: slide down + fade in. Exit: the reverse — slide back up + fade, not a bare opacity cut.
      // (`-translate-y-full` because the stack is top-anchored: a toast arrives from off the top edge.)
      "data-ending-style:-translate-y-full data-ending-style:opacity-0 data-limited:hidden data-starting-style:-translate-y-full data-starting-style:opacity-0",
      // Suspend the transition while a swipe is in progress so the gesture tracks the pointer 1:1.
      "data-swiping:transition-none",
      // Base UI gives the root `tabIndex: 0` (ToastRoot.mjs), so it IS a focus stop. The ring is the
      // OUTLINE helper, not the box-shadow one: this element carries `shadow-overlay`, and a box-shadow
      // ring loses that slot to the elevation — the first swing at P3-1 shipped `outline-none` + the ring
      // helper and painted NOTHING under a real Tab (see FOCUS_RING_OUTLINE's header for the measurement).
      // No `outline-none` here, deliberately: it would set `--tw-outline-style: none` and re-break it.
      FOCUS_RING_OUTLINE,
      // Written as `[&[data-type=…]]:` because biome's noSecrets heuristic false-positives on the `loading` shorthand.
      "data-[type=error]:border-destructive",
      "data-[type=success]:border-success",
      "data-[type=warning]:border-warning",
      "data-[type=loading]:border-primary",
    ],
    // The type glyphs — the non-colour half of each identity (WCAG 1.4.1: a tint is never the only signal).
    // One slot per meaning-bearing type rather than one slot recoloured by a `data-type` descendant
    // selector: the token then sits beside the border token it must agree with. `mt-tight` optically
    // centres the glyph on the title's cap-height rather than on its line box.
    // ERROR earns the shape most of the three — its border is the WEAKEST tint of the set at 4.59:1
    // (side-eye re-verify), so colour alone was carrying the least here and failing hardest.
    warningIcon: "mbs-tight shrink-0 text-warning",
    errorIcon: "mbs-tight shrink-0 text-destructive",
    successIcon: "mbs-tight shrink-0 text-success",
    // `pr-(--size-control-sm)` is the CLOSE BUTTON'S RESERVATION (side-eye P1-2 — the ✕ was painting over the copy,
    // 26×26px of measured overlap). The close is `absolute top-field right-field size-(--size-control-sm)`, so its
    // left edge sits `field + control-sm` in from the root's right edge while the content's own right edge
    // sits only `p-block` in. The shortfall is `field + control-sm − block`; reserving a full `control-sm`
    // covers it and leaves exactly `field` of breathing room — in BOTH pointer regimes, because `field`,
    // `block` and `control-sm` all shift together. Stated in tokens so it can never drift from the button.
    content: "flex flex-1 flex-col gap-field pe-(--size-control-sm) min-inline-0",
    title: "text-label leading-label font-semibold",
    description: "text-label leading-label text-muted-foreground",
    close: `
      absolute inset-e-field inset-bs-field flex items-center justify-center rounded-control text-muted-foreground outline-none block-(--size-control-sm)
      inline-(--size-control-sm)
      ${ACCENT_HOVER}
      ${FOCUS_RING_ON_POPOVER}
    `,
    // The action wears the house PRIMARY fill (Button's `intent="primary"` recipe, minus its page-CTA
    // shadow — a glow inside an already-elevated float is noise). `bg-secondary` FAILED WCAG 1.4.11: it is
    // one L-step off `bg-popover` (0.255 vs 0.245) for a measured 1.03:1 boundary with `border: 0`, so the
    // only actionable thing in the toast read as stray text. No border token fixes it — `--color-border` is
    // 8%-alpha white over the same fill (~1.1:1); the boundary has to come from the fill.
    action: `
      mbs-field inline-flex items-center justify-center gap-field rounded-control bg-tone-solid px-block text-label leading-label font-medium whitespace-nowrap
      text-tone-foreground transition-colors duration-(--motion-fast) ease-out-expo outline-none block-(--size-control-sm) inline-fit
      hover:bg-tone-solid-hover
      active:bg-tone-solid-active
      ${FOCUS_RING_ON_POPOVER}
    `,
  },
});

/** The D336 tone the action button's solid paints. */
export const TOAST_ACTION_TONE = "primary" satisfies Tone;
