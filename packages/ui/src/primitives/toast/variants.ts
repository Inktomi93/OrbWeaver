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
    // THE RESIDUAL THIS LINE CARRIED IS RETIRED (#193). It read: "on a phone the stack lands on the
    // message transcript… No inset avoids it, and the reason is STRUCTURAL… Escaping the choice entirely
    // means a non-overlay surface (a reflowing shell band), which is layout machinery, not an inset —
    // raise it as its own piece of work." That work is done: the `band` placement below is the non-overlay
    // surface, the client mounts the app's stack into a shell band, and an overlay toast no longer has to
    // choose which load-bearing edge it covers. `overlay` survives as the placement for a surface with NO
    // shell around it (the login screen, the app-level crash fallback) — see `placement` under variants.
    //
    // `pointer-events-none` on the region so an empty viewport never eats clicks on the controls it
    // overlaps — individual toasts opt back in via `root`'s `pointer-events-auto`. No `outline-none`:
    // nothing rings this element today, but the reset would arm the `--tw-outline-style` landmine that
    // FOCUS_RING_OUTLINE's header documents for whoever adds one (the Viewport IS an F6 focus stop).
    viewport: "pointer-events-none flex w-full max-w-cq-sm flex-col gap-row p-section",
    root: [
      // `flex` + `gap-row`: the type GLYPH is a sibling of the content column (see `icon`), so meaning is
      // never carried by the border colour alone.
      "pointer-events-auto relative flex w-full gap-row rounded-card border border-border bg-popover p-block text-popover-foreground shadow-overlay",
      // The transition NAMES ITS THREE PROPERTIES — `transition-all` was a bug, not a shorthand.
      // `outline-*` is interpolable, so `all` faded the focus ring in over `--motion-base`: a keyboard
      // user moving at speed saw a desaturated half-ring at every stop, and the ring is the one thing on
      // this element that must be instant. Naming the set also keeps the animation compositor-friendly.
      // The three are exactly what the motion below needs: `opacity` + `translate` (the enter/exit slide,
      // which is Tailwind v4's `translate` property, NOT `transform`) and `transform` (the swipe-movement
      // vars on this same line). Dropping any one silently kills that half of the motion — see Button's
      // variants for the sibling case where `scale` had to be named for the same reason.
      "transition-[opacity,transform,translate] duration-(--motion-base) ease-out-expo [transform:translate(var(--toast-swipe-movement-x),var(--toast-swipe-movement-y))]",
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
  variants: {
    /**
     * WHERE THE STACK LIVES — the #193 escape, and the only axis on this component that is not cosmetic.
     *
     * `band` is the APP's arm (`AppToaster` asks for it whenever a shell is mounted): the viewport
     * renders IN NORMAL FLOW inside a host that is
     * itself a row of the shell's content column, so raising a notice REFLOWS the column instead of
     * painting over it. Occlusion is then impossible by construction rather than by inset arithmetic —
     * which is what the retired residual above proved could not be made to work on a 430-wide column
     * (topbar, transcript, composer, tab bar, and no toast-height gap that is none of them).
     * `ms-auto` keeps the stack's own max-width column at the END of the band, so the shape a reader
     * already knows — a right-aligned stack of cards under the chrome row — survives the move.
     *
     * `overlay` is the FIXED top-right float and the DEFAULT, because a primitive holds no opinion about
     * an app's shell: a surface with no band to reflow into (the login screen, the app-level crash
     * fallback, a bare playground) must still be able to speak. It stays TOP-anchored for the
     * reason it was moved there (side-eye INFRA-WARN-DEAF P1-1): a bottom stack covered the chat
     * composer's Send button by 94% and swallowed the click, at the turn-terminal moment the user reaches
     * for it. Every bottom edge in the shell is load-bearing; only the chrome row is along the top, and
     * the inset clears it.
     */
    placement: {
      band: { viewport: "ms-auto" },
      overlay: { viewport: "fixed top-(--dimension-chrome-row) right-0 z-(--z-toast)" },
    },
  },
  defaultVariants: { placement: "overlay" },
});
