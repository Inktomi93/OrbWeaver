import { MODAL_SURFACE, OVERLAY_MOTION, SCRIM, tv } from "#lib";

// Wide data pickers use a field inset to retain narrow-screen reading width; lg keeps its usual modal gutter.
// Backdrop is the theme-aware `--scrim` token (never `bg-black/50`); the stack sits at `--z-modal`.
// Scroll ownership: the POPUP owns layout AND scroll, never the backdrop/viewport — the viewport is a
// plain flex container (not a scroll container) that centres the popup inline and places it on the block
// axis by the `anchor` variant; flex (not grid) has a definite height so `max-h-full`/`h-full` clamp
// correctly on the popup. The popup pairs that clamp with
// `overflow-y-auto overscroll-contain` (matching drawer-content) so tall content — a FormDialog whose
// body outgrows the viewport — actually scrolls to its submit button instead of overflowing off-screen.
// The gutter is a rem token, so enlarged text grows it with the type; at a narrow width it steps down to the field inset so
// a phone keeps a readable dialog width at 300%.
const VIEWPORT_GUTTER = "p-gutter inline-narrow:p-field";

export const dialogVariants = tv({
  slots: {
    // The modal scrim + the dialog-only `backdrop-blur-sm` on top (alert-dialog shares the scrim, not the blur).
    backdrop: `${SCRIM("modal")} backdrop-blur-sm`,
    // Viewport gutter is set per-size (below), never in the base. Pre-#146 the reason was that `full`'s `p-0`
    // and a base `p-gutter` were two padding classes tailwind-merge could not dedupe; with the spacing scale
    // registered they DO dedupe last-wins, and per-size stays because a size arm STATING its own gutter is
    // legible where an arm neutralising an inherited one is not.
    viewport: "@container fixed inset-0 z-(--z-modal) flex justify-center",
    popup: `relative flex flex-col overflow-x-hidden overflow-y-auto overscroll-contain max-block-full ${MODAL_SURFACE} @max-cq-20:p-field ${OVERLAY_MOTION.modalPopup}
    `,
    header: "flex shrink-0 items-center justify-between gap-row border-be border-border pbe-field",
    title: "text-title leading-title font-semibold",
    description: "mbs-field text-body leading-body text-muted-foreground",
    // The action row: the LAST child of a DialogBody, never of the popup itself. The popup's padding
    // surrounds that region, so `sticky bottom-0` lands the buttons exactly one popup inset above the popup edge.
    footer: "sticky inset-be-0 z-(--z-raised) flex shrink-0 flex-wrap items-center justify-end gap-field bg-popover pbs-field",
  },
  variants: {
    spaced: { true: { popup: "gap-block" }, false: {} },
    // The title clears the close button pinned over its corner. Under the narrow step the close takes its own line,
    // because a word beside it would break letter by letter.
    clearsClose: { true: { title: "pe-(--size-control-md) wrap-break-word @max-cq-20:pe-0 @max-cq-20:pbs-(--size-control-md)" }, false: {} },
    // A heading that takes programmatic arrival focus and no key: a ring would read as a field to type in.
    focusTarget: { true: { title: "outline-none" }, false: {} },
    // A header that stays in view while the body scrolls under it (a drawer's title and close), on the card fill so
    // scrolled rows do not show through.
    stickyHeader: { true: { header: "sticky inset-bs-0 z-(--z-raised) bg-card" }, false: {} },
    size: {
      sm: { viewport: VIEWPORT_GUTTER, popup: "max-inline-(--width-dialog-sm)" },
      md: { viewport: VIEWPORT_GUTTER, popup: "max-inline-(--width-dialog-md)" },
      lg: { viewport: VIEWPORT_GUTTER, popup: "max-inline-(--width-dialog-lg)" },
      wide: { viewport: "p-field", popup: "max-inline-(--width-dialog-lg)" },
      // The large shell modal: fills most of the screen but stays a centered card, capped at xl width.
      xl: { viewport: VIEWPORT_GUTTER, popup: "block-full max-inline-(--width-dialog-xl)" },
      // Hugs its content on both axes, up to the xl width (a lightbox sized by the image it holds).
      xlFit: { viewport: VIEWPORT_GUTTER, popup: "inline-fit max-inline-(--width-dialog-xl)" },
      full: { viewport: "p-0", popup: "rounded-none border-0 block-full inline-full max-inline-none" },
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
