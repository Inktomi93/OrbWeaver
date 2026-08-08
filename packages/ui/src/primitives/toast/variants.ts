import { ACCENT_HOVER, FOCUS_RING, FOCUS_RING_ON_POPOVER, tv } from "#lib";

export const toastVariants = tv({
  slots: {
    // TOP-anchored, not bottom (side-eye INFRA-WARN-DEAF P1-1). A bottom-right stack lands on whatever the
    // app puts at the bottom of the screen, and in this app that is the chat COMPOSER: the stack covered
    // its Send button by 94% and swallowed the click — fired at the TURN-TERMINAL moment, i.e. exactly when
    // the user reaches for Send. Every bottom edge in the shell is load-bearing (composer on desktop, the
    // mobile tab bar at ≤48rem); the only thing along the top is the chrome row, which the inset clears.
    // `p-section` then adds the float gap. A consumer that wants it elsewhere still has `className` +
    // `container` + `swipeDirection` (ToasterProps).
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
      // Base UI gives the root `tabIndex: 0` (ToastRoot.mjs), so it IS a focus stop — it was wearing the UA
      // outline, the one focusable surface in the app not on the app ring (side-eye P3-1). The ring offset
      // is `background` (not `popover`): the toast floats over the page, not inside a popover surface.
      `outline-none ${FOCUS_RING}`,
      // Written as `[&[data-type=…]]:` because biome's noSecrets heuristic false-positives on the `loading` shorthand.
      "[&[data-type=error]]:border-destructive",
      "[&[data-type=success]]:border-success",
      "[&[data-type=warning]]:border-warning",
      "[&[data-type=loading]]:border-primary",
    ],
    // The warning glyph — the non-colour half of the warning identity. `mt-tight` optically centres it on
    // the title's cap-height rather than on its line box.
    warningIcon: "mt-tight shrink-0 text-warning",
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
    action: `mt-field inline-flex h-control-sm w-fit items-center justify-center gap-field whitespace-nowrap rounded-control bg-secondary px-block text-label leading-label font-medium text-secondary-foreground outline-none transition-colors duration-(--motion-fast) ease-out-expo ${ACCENT_HOVER} active:bg-accent/80 ${FOCUS_RING_ON_POPOVER}`,
  },
});
