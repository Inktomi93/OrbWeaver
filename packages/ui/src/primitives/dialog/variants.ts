import { MODAL_SURFACE, OVERLAY_MOTION, SCRIM, tv } from "#lib";

// Backdrop is the theme-aware `--scrim` token (never `bg-black/50`); the stack sits at `--z-modal`.
// Scroll ownership: the POPUP owns layout AND scroll, never the backdrop/viewport — the viewport is a
// plain flex container (not a scroll container) that centres the popup inline and places it on the block
// axis by the `anchor` variant; flex (not grid) has a definite height so `max-h-full`/`h-full` clamp
// correctly on the popup. The popup pairs that clamp with
// `overflow-y-auto overscroll-contain` (matching drawer-content) so tall content — a FormDialog whose
// body outgrows the viewport — actually scrolls to its submit button instead of overflowing off-screen.
/**
 * The class for a region that scrolls a dialog body above a DialogFooter. `scroll-pb-(--size-control-lg)` is the
 * footer's height, so a focused field scrolls clear of the sticky footer instead of under it.
 *
 * The inline bleed (negative margin, matching padding) keeps a control flush with the body's edge whole:
 * `overflow-y: auto` also clips the inline axis, and a glyph button's touch pseudo reaches past its box by up to
 * (touch target - glyph-xs) / 2. The popup's own `p-section` is wider than that, so the margin never overflows it.
 */
export const DIALOG_SCROLL_CLASS =
  "relative -mx-[calc((var(--size-touch-target)_-_var(--size-glyph-xs))_/_2)] min-h-0 overflow-y-auto overscroll-contain px-[calc((var(--size-touch-target)_-_var(--size-glyph-xs))_/_2)] scroll-pb-(--size-control-lg)";

export const dialogVariants = tv({
  slots: {
    // The modal scrim + the dialog-only `backdrop-blur-sm` on top (alert-dialog shares the scrim, not the blur).
    backdrop: `${SCRIM("modal")} backdrop-blur-sm`,
    // Viewport gutter is set per-size (below), never in the base. Pre-#146 the reason was that `full`'s `p-0`
    // and a base `p-gutter` were two padding classes tailwind-merge could not dedupe; with the spacing scale
    // registered they DO dedupe last-wins, and per-size stays because a size arm STATING its own gutter is
    // legible where an arm neutralising an inherited one is not.
    viewport: "fixed inset-0 z-(--z-modal) flex justify-center",
    popup: `relative flex max-h-full flex-col overflow-y-auto overscroll-contain ${MODAL_SURFACE} ${OVERLAY_MOTION.modalPopup}`,
    header: "flex shrink-0 items-center justify-between gap-row border-b border-border pb-field",
    title: "text-title leading-title font-semibold",
    description: "mt-field text-body leading-body text-muted-foreground",
    // The action row: the LAST child of a DIALOG_SCROLL_CLASS region, never of the popup itself. The popup's padding
    // surrounds that region, so `sticky bottom-0` lands the buttons exactly one popup inset above the popup edge.
    footer: "sticky bottom-0 z-(--z-raised) flex shrink-0 flex-wrap items-center justify-end gap-field bg-popover pt-field",
  },
  variants: {
    size: {
      sm: { viewport: "p-gutter", popup: "max-w-(--width-dialog-sm)" },
      md: { viewport: "p-gutter", popup: "max-w-(--width-dialog-md)" },
      lg: { viewport: "p-gutter", popup: "max-w-(--width-dialog-lg)" },
      // The large shell modal: fills most of the screen but stays a centered card, capped at xl width.
      xl: { viewport: "p-gutter", popup: "h-full max-w-(--width-dialog-xl)" },
      // Hugs its content on both axes, up to the xl width (a lightbox sized by the image it holds).
      xlFit: { viewport: "p-gutter", popup: "w-fit max-w-(--width-dialog-xl)" },
      full: { viewport: "p-0", popup: "h-full w-full max-w-none rounded-none border-0" },
    },
    // Where the popup sits on the block axis. `top` pins its top edge at the viewport gutter, so a dialog whose
    // body changes height (a filter that empties a grid) keeps its heading and controls under the pointer;
    // a centred popup moves them by half the height change.
    anchor: {
      center: { viewport: "items-center" },
      top: { viewport: "items-start" },
    },
  },
  defaultVariants: { size: "md", anchor: "center" },
});
