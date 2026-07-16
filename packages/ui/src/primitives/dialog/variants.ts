import { MODAL_SURFACE, OVERLAY_MOTION, SCRIM, tv } from "#lib";

// Backdrop is the theme-aware `--scrim` token (never `bg-black/50`); the stack sits at `--z-modal`.
// Scroll ownership: the POPUP owns layout, never the backdrop/viewport — the viewport is a plain flex
// centering container (not a scroll container), and flex (not grid) centering has a definite height so
// `max-h-full`/`h-full` clamp correctly on the popup.
export const dialogVariants = tv({
  slots: {
    // The modal scrim + the dialog-only `backdrop-blur-sm` on top (alert-dialog shares the scrim, not the blur).
    backdrop: `${SCRIM("modal")} backdrop-blur-sm`,
    // Viewport gutter is set per-size (below), never in the base — else `full`'s `p-0` and a base `p-gutter`
    // are two padding classes tailwind-merge can't dedupe.
    viewport: "fixed inset-0 z-(--z-modal) flex items-center justify-center",
    popup: `flex max-h-full flex-col ${MODAL_SURFACE} ${OVERLAY_MOTION.modalPopup}`,
    title: "text-title leading-title font-semibold",
    description: "mt-field text-body leading-body text-muted-foreground",
  },
  variants: {
    size: {
      sm: { viewport: "p-gutter", popup: "max-w-(--width-dialog-sm)" },
      md: { viewport: "p-gutter", popup: "max-w-(--width-dialog-md)" },
      lg: { viewport: "p-gutter", popup: "max-w-(--width-dialog-lg)" },
      // The large shell modal: fills most of the screen but stays a centered card, capped at xl width.
      xl: { viewport: "p-gutter", popup: "h-full max-w-(--width-dialog-xl)" },
      full: { viewport: "p-0", popup: "h-full w-full max-w-none rounded-none border-0" },
    },
  },
  defaultVariants: { size: "md" },
});
