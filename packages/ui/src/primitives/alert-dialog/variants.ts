import { MODAL_SURFACE, OVERLAY_MOTION, POPUP_DESCRIPTION, SCRIM, TITLE_STEP, tv } from "#lib";

/**
 * Slot classes for the alert-dialog overlay stack (ui-package-design §5). COMPOSES dialog's shared
 * modal pieces — the `SCRIM("modal")` backdrop (D43 §11.4 — never `bg-black/50`) and `MODAL_SURFACE`
 * popup card — so the two can never drift; alert-dialog then diverges only where it must (no
 * backdrop-blur, a scrollable grid viewport for a taller confirm, a fixed `max-w-cq-24`, and — unlike
 * Dialog — non-dismissible on backdrop click). The `actions` row right-aligns the cancel/confirm
 * pair; the confirm slot wears the destructive intent (a `Button variant`), not a color literal.
 */
export const alertDialogVariants = tv({
  slots: {
    backdrop: SCRIM("modal"),
    viewport: "fixed inset-0 z-(--z-modal) grid place-items-center overflow-y-auto overscroll-contain px-(--width-dialog-gutter) py-(--height-dialog-gutter)",
    popup: `${MODAL_SURFACE} max-inline-cq-24 ${OVERLAY_MOTION.modalPopup}`,
    title: TITLE_STEP,
    description: POPUP_DESCRIPTION,
    actions: "mbs-section flex items-center justify-end gap-row",
  },
});
