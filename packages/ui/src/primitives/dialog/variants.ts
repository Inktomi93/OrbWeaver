import { OVERLAY_MOTION, tv } from "#lib";

/**
 * Slot classes for the dialog overlay stack (ui-package-design §5 — slots for multi-part).
 * Backdrop is the theme-aware `--scrim` token (D43 §11.4 — never `bg-black/50`); the stack sits at
 * `--z-modal`. Enter/exit animation rides Base UI's `data-starting-style`/`data-ending-style`.
 *
 * `size` (D62 UIP-401): the popup width — `sm|md|lg` clamp to the dedicated `--width-dialog-*` tokens
 * (400/560/720px; DISTINCT from the `--container-cq-*` container-query breakpoints — one-home rule),
 * consumed via the `max-w-(--…)` var shorthand (never a raw bracket — gate no-arbitrary-tw-values). `full` is
 * the full-bleed presentation (J11 settings overlay): the popup fills the viewport (no max-width,
 * no radius, no border) and the viewport drops its gutter padding. `w-full` + the max-width cap keeps
 * the sm/md/lg popups fluid below their clamp.
 *
 * SCROLL OWNERSHIP (§13.7 overlay-anatomy): the POPUP owns layout, NEVER the backdrop/viewport. The
 * viewport is a plain flex CENTERING container — it is NOT a scroll container (a scrollable viewport
 * took the title + close + any pinned nav out of view along with the content). The popup is a capped
 * flex COLUMN (`flex flex-col max-h-full`) so a consumer can pin a header and let ONLY an interior body
 * region scroll (`flex-1 min-h-0 overflow-y-auto` — the same capped-flex pattern the drawer uses). Flex
 * (not grid) centering is deliberate: a grid `place-items-center` track auto-sizes to its content, so a
 * `max-h`/`h-full` percentage resolved against it never clamps (tall popups grew unbounded); a flex
 * container has a definite height, so `max-h-full`/`h-full` clamp correctly.
 */
export const dialogVariants = tv({
  slots: {
    backdrop: `fixed inset-0 z-(--z-modal) bg-scrim backdrop-blur-sm ${OVERLAY_MOTION.backdropFade("base")}`,
    // Viewport gutter is set PER-SIZE (below), never in the base — else `full`'s `p-0` and the base
    // `p-gutter` are two padding classes tailwind-merge can't dedupe (custom `gutter` scale), and the
    // gutter wins. One padding class per size = a clean override. NOT a scroll container (see header).
    viewport: "fixed inset-0 z-(--z-modal) flex items-center justify-center",
    popup: `flex max-h-full w-full flex-col rounded-card border border-border bg-popover p-section text-popover-foreground shadow-overlay ${OVERLAY_MOTION.modalPopup}`,
    title: "text-title leading-title font-semibold",
    description: "mt-field text-body leading-body text-muted-foreground",
  },
  variants: {
    size: {
      sm: { viewport: "p-gutter", popup: "max-w-(--width-dialog-sm)" },
      md: { viewport: "p-gutter", popup: "max-w-(--width-dialog-md)" },
      lg: { viewport: "p-gutter", popup: "max-w-(--width-dialog-lg)" },
      // The large SHELL modal (settings + other nav-plus-content modals): fills the gutter-padded,
      // blurred viewport (`h-full`) so it takes most of the screen, but stays a centered CARD (keeps
      // the base radius/border/shadow) capped at the xl width — not the edge-to-edge `full` bleed.
      xl: { viewport: "p-gutter", popup: "h-full max-w-(--width-dialog-xl)" },
      full: { viewport: "p-0", popup: "h-full w-full max-w-none rounded-none border-0" },
    },
  },
  defaultVariants: { size: "md" },
});
