import { MIN_HEIGHT, MODAL_SURFACE, OVERLAY_MOTION, POPUP_DESCRIPTION, PUSH, SCRIM, TITLE_STEP, tv, WRAP } from "#lib";

// Wide data pickers use a field inset to retain narrow-screen reading width; lg keeps its usual modal gutter.
// Backdrop is the theme-aware `--scrim` token (never `bg-black/50`); the stack sits at `--z-modal`.
// Scroll ownership: the POPUP owns layout AND scroll, never the backdrop/viewport — the viewport is a
// plain flex container (not a scroll container) that centres the popup inline and places it on the block
// axis by the `anchor` variant; flex (not grid) has a definite height so `max-h-full`/`h-full` clamp
// correctly on the popup. The popup pairs that clamp with
// `overflow-y-auto overscroll-contain` (matching drawer-content) so tall content — a FormDialog whose
// body outgrows the viewport — actually scrolls to its submit button instead of overflowing off-screen.
// The gutter is a rem token, so enlarged text grows it with the type; at a narrow width it steps down to the field inset so
// a phone keeps a readable dialog width at 300%. Both axes are capped at a twentieth of the screen, so enlarged text does not
// spend the screen's room on margin.
const VIEWPORT_GUTTER = "px-(--width-dialog-gutter) py-(--height-dialog-gutter) inline-narrow:p-field";

export const dialogVariants = tv({
  slots: {
    // The modal scrim + the dialog-only `backdrop-blur-sm` on top (alert-dialog shares the scrim, not the blur).
    backdrop: `${SCRIM("modal")} backdrop-blur-sm`,
    // Viewport gutter is set per-size (below), never in the base. Pre-#146 the reason was that `full`'s `p-0`
    // and a base `p-gutter` were two padding classes tailwind-merge could not dedupe; with the spacing scale
    // registered they DO dedupe last-wins, and per-size stays because a size arm STATING its own gutter is
    // legible where an arm neutralising an inherited one is not.
    // The inline step queries and the `dialog-short` variant both read this box; its size container is primitives.css's rule.
    viewport: "fixed inset-0 z-(--z-modal) flex justify-center",
    // A landscape phone's dialog gives its inset and its heading gap back to its content, because its chrome is already most of the box. A stacked
    // dialog (enlarged text on a portrait phone or a desktop) gives its heading gap back to the row step, and its inset back to the field step at any
    // width, for the same reason; a landscape phone's keeps its own insets.
    popup: `relative flex flex-col overflow-x-hidden overflow-y-auto overscroll-contain max-block-full ${MODAL_SURFACE}
      @max-cq-20:p-field
      dialog-short:glass-short:gap-row dialog-short:glass-short:p-row dialog-short:glass-short:pbs-0
      dialog-stacked:gap-row
      dialog-stacked:not-glass-short:p-field
      dialog-tiny:glass-short:gap-0 dialog-tiny:glass-short:pbe-0
      ${OVERLAY_MOTION.modalPopup}
    `,
    // A landscape phone's dialog scrolls as one sheet, so its header stays at the top of the sheet: the popup gives its top inset to the header,
    // which rests against the true edge and keeps the body from scrolling through the padding above it. The header holds one line, so
    // its title gives way before Close takes a second line of a screen with no room for it. A tiny one (enlarged text on a landscape
    // phone) spends none of its height on insets: its title row, field and rows are all it has. A phone-width screen (a width in the glass, so a
    // landscape phone is never one) scrolls its header away: at enlarged text it is taller than the room a control below it needs.
    header: `
      flex shrink-0 items-center justify-between gap-row border-be border-border pbe-field
      dialog-short:glass-short:flex-nowrap dialog-short:glass-short:bg-popover dialog-short:glass-short:pbs-row
      dialog-short:glass-short:not-inline-narrow:sticky dialog-short:glass-short:not-inline-narrow:inset-bs-0
      dialog-short:glass-short:not-inline-narrow:z-(--z-raised) dialog-short:glass-short:not-inline-narrow:-mx-row
      dialog-short:glass-short:not-inline-narrow:px-row
      dialog-tiny:glass-short:pbs-0 dialog-tiny:glass-short:pbe-0
    `,
    // A landscape phone's dialog title truncates to one line; its full text stays the dialog's accessible name.
    title: `${TITLE_STEP} dialog-short:glass-short:truncate ${MIN_HEIGHT.holdsLineOnLandscape}`,
    description: POPUP_DESCRIPTION,
    // The action row: the LAST child of a DialogBody, never of the popup itself. The popup's padding
    // surrounds that region, so `sticky bottom-0` lands the buttons exactly one popup inset above the popup edge.
    // A tiny dialog (enlarged text on a landscape phone) stacks its actions to a height that can exceed the body, so the row
    // scrolls with the sheet there instead of covering every field.
    footer: "sticky inset-be-0 z-(--z-raised) flex shrink-0 flex-wrap items-center justify-end gap-field bg-popover pbs-field dialog-tiny:static",
  },
  variants: {
    spaced: { true: { popup: "gap-block" } },
    // The title clears the close button pinned over its corner. Under the narrow step the close takes its own line,
    // because a word beside it would break letter by letter.
    clearsClose: { true: { title: "pe-(--size-control-md) wrap-break-word @max-cq-20:pe-0 @max-cq-20:pbs-(--size-control-md)" }, false: {} },
    // A heading that takes programmatic arrival focus and no key: a ring would read as a field to type in.
    focusTarget: { true: { title: "outline-none" }, false: {} },
    // A title that must hold one line beside the dialog's actions.
    truncate: { true: { title: "truncate" }, false: {} },
    // A header that stays in view while the body scrolls under it (a drawer's title and close), on the card fill so
    // scrolled rows do not show through. A sticky box rests against the scroller's content edge, not its padding edge,
    // so the header grows upward by the drawer's own inset (`p-section`) and rests against the true top: rows never
    // scroll through the padding above it.
    stickyHeader: { true: { header: "sticky -inset-bs-section z-(--z-raised) -mbs-section mbe-block bg-card pbs-section" } },
    // The foot sets at the end of a tall body: only the block-end arm has a caller, so it is the only arm.
    footerPush: { blockEnd: { footer: PUSH.blockEnd } },
    // A title and actions that run out of room take a second line.
    headerWrap: { true: { header: WRAP.true } },
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
