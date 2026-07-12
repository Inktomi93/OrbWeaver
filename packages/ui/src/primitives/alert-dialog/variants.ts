import { OVERLAY_MOTION, tv } from "#lib";

/**
 * Slot classes for the alert-dialog overlay stack (ui-package-design §5). Mirrors the dialog skin:
 * theme-aware `bg-scrim` backdrop (D43 §11.4 — never `bg-black/50`) at `--z-modal`, enter/exit on
 * Base UI's `data-starting-style`/`data-ending-style`. The `actions` row right-aligns the
 * cancel/confirm buttons — the confirm slot wears the destructive intent (a `Button variant`), not
 * a color literal.
 */
export const alertDialogVariants = tv({
  slots: {
    backdrop: `fixed inset-0 z-(--z-modal) bg-scrim ${OVERLAY_MOTION.backdropFade("base")}`,
    viewport: "fixed inset-0 z-(--z-modal) grid place-items-center overflow-y-auto p-gutter",
    popup: `w-full max-w-cq-sm rounded-card border border-border bg-popover p-section text-popover-foreground shadow-overlay ${OVERLAY_MOTION.modalPopup}`,
    title: "text-title leading-title font-semibold",
    description: "mt-field text-body leading-body text-muted-foreground",
    actions: "mt-section flex items-center justify-end gap-row",
  },
});
