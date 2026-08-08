import { ACCENT_HOVER, FOCUS_RING_ON_POPOVER, FOCUS_RING_OUTLINE, tv } from "#lib";

export const toastVariants = tv({
  slots: {
    // TOP-anchored, not bottom (side-eye INFRA-WARN-DEAF P1-1). A bottom-right stack lands on whatever the
    // app puts at the bottom of the screen, and in this app that is the chat COMPOSER: the stack covered
    // its Send button by 94% and swallowed the click — fired at the TURN-TERMINAL moment, i.e. exactly when
    // the user reaches for Send. Every bottom edge in the shell is load-bearing (composer on desktop, the
    // mobile tab bar at ≤48rem); the only thing along the top is the chrome row, which the inset clears.
    // `p-section` then adds the float gap. A consumer that wants it elsewhere still has `className` +
    // `container` + `swipeDirection` (ToasterProps).
    //
    // ACCEPTED RESIDUAL — on a phone the stack lands on the message transcript, covering one row's
    // secondary actions (Edit / Fork / More; side-eye re-verify, measured). There is no inset that
    // avoids it: at 430×740 the bands are topbar 0-48, TRANSCRIPT 48-548, composer 548-672, tab bar
    // 684-740, so an overlay toast must cover the transcript or the composer — the two constraints are
    // mutually exclusive, and the composer collision is the one that was a P1 (94% of Send, click
    // swallowed, at the turn-terminal moment the user reaches for it). Row actions are per-row,
    // duplicated on every row the toast does not cover, and the toast is gone in 5-12s or one swipe.
    // Escaping the choice entirely means a non-overlay surface (a reflowing shell band), which is
    // layout machinery, not an inset — raise it as its own piece of work, don't retune this line.
    // `pointer-events-none` on the region so an empty viewport never eats clicks on the controls it
    // overlaps — individual toasts opt back in via `root`'s `pointer-events-auto`.
    viewport: "pointer-events-none fixed top-(--dimension-chrome-row) right-0 z-(--z-toast) flex w-full max-w-cq-sm flex-col gap-row p-section outline-none",
    root: [
      // `flex` + `gap-row`: the type GLYPH is a sibling of the content column (see `icon`), so meaning is
      // never carried by the border colour alone.
      "pointer-events-auto relative flex w-full gap-row rounded-card border border-border bg-popover p-block text-popover-foreground shadow-overlay",
      "transition-all duration-(--motion-base) ease-out-expo [transform:translate(var(--toast-swipe-movement-x),var(--toast-swipe-movement-y))]",
      // Enter: slide down + fade in. Exit: the reverse — slide back up + fade, not a bare opacity cut.
      // (`-translate-y-full` because the stack is top-anchored: a toast arrives from off the top edge.)
      "data-limited:hidden data-starting-style:opacity-0 data-starting-style:-translate-y-full data-ending-style:opacity-0 data-ending-style:-translate-y-full",
      // Suspend the transition while a swipe is in progress so the gesture tracks the pointer 1:1.
      "data-swiping:transition-none",
      // Base UI gives the root `tabIndex: 0` (ToastRoot.mjs), so it IS a focus stop. The ring is the
      // OUTLINE helper, not the box-shadow one: this element carries `shadow-overlay`, and a box-shadow
      // ring loses that slot to the elevation — the first swing at P3-1 shipped `outline-none` + the ring
      // helper and painted NOTHING under a real Tab (see FOCUS_RING_OUTLINE's header for the measurement).
      // No `outline-none` here, deliberately: it would set `--tw-outline-style: none` and re-break it.
      FOCUS_RING_OUTLINE,
      // Written as `[&[data-type=…]]:` because biome's noSecrets heuristic false-positives on the `loading` shorthand.
      "[&[data-type=error]]:border-destructive",
      "[&[data-type=success]]:border-success",
      "[&[data-type=warning]]:border-warning",
      "[&[data-type=loading]]:border-primary",
    ],
    // The type glyphs — the non-colour half of each identity (WCAG 1.4.1: a tint is never the only signal).
    // One slot per meaning-bearing type rather than one slot recoloured by a `data-type` descendant
    // selector: the token then sits beside the border token it must agree with. `mt-tight` optically
    // centres the glyph on the title's cap-height rather than on its line box.
    // ERROR earns the shape most of the three — its border is the WEAKEST tint of the set at 4.59:1
    // (side-eye re-verify), so colour alone was carrying the least here and failing hardest.
    warningIcon: "mt-tight shrink-0 text-warning",
    errorIcon: "mt-tight shrink-0 text-destructive",
    successIcon: "mt-tight shrink-0 text-success",
    // `pr-control-sm` is the CLOSE BUTTON'S RESERVATION (side-eye P1-2 — the ✕ was painting over the copy,
    // 26×26px of measured overlap). The close is `absolute top-field right-field size-control-sm`, so its
    // left edge sits `field + control-sm` in from the root's right edge while the content's own right edge
    // sits only `p-block` in. The shortfall is `field + control-sm − block`; reserving a full `control-sm`
    // covers it and leaves exactly `field` of breathing room — in BOTH pointer regimes, because `field`,
    // `block` and `control-sm` all shift together. Stated in tokens so it can never drift from the button.
    content: "flex min-w-0 flex-1 flex-col gap-field pr-control-sm",
    title: "text-label leading-label font-semibold",
    description: "text-label leading-label text-muted-foreground",
    close: `absolute top-field right-field flex size-control-sm items-center justify-center rounded-control text-muted-foreground outline-none ${ACCENT_HOVER} ${FOCUS_RING_ON_POPOVER}`,
    // The action wears the house PRIMARY fill (Button's `intent="primary"` recipe, minus its page-CTA
    // shadow — a glow inside an already-elevated float is noise). `bg-secondary` FAILED WCAG 1.4.11: it is
    // one L-step off `bg-popover` (0.255 vs 0.245) for a measured 1.03:1 boundary with `border: 0`, so the
    // only actionable thing in the toast read as stray text. No border token fixes it — `--color-border` is
    // 8%-alpha white over the same fill (~1.1:1); the boundary has to come from the fill.
    action: `mt-field inline-flex h-control-sm w-fit items-center justify-center gap-field whitespace-nowrap rounded-control bg-primary px-block text-label leading-label font-medium text-primary-foreground outline-none transition-colors duration-(--motion-fast) ease-out-expo hover:bg-primary/90 active:bg-primary/80 ${FOCUS_RING_ON_POPOVER}`,
  },
});
