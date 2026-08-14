// Shared popup/menu SURFACE recipes (bg-popover card chrome), extracted so the border/bg/radius/
// text-color quad can never drift between the seals that layer on top of it. Motion is composed
// SEPARATELY by each consumer (OVERLAY_MOTION.anchoredPopup / .modalPopup) — these are the resting
// skin only, so a seal keeps ownership of its own animation timing.
import { DISABLED_STATE } from "./disabled-state.ts";

// The anchored scrollable list popup (select/autocomplete/combobox). The WIDTH class is per-seal
// (select uses `min-w-(--anchor-width)` so a long option can grow the popup; autocomplete/combobox
// lock to `w-(--anchor-width)`), so it is NOT baked here — the consumer adds it.
export const POPUP_SURFACE =
  "relative z-(--z-popover) max-h-(--available-height) overflow-y-auto rounded-card border border-border bg-popover p-field text-popover-foreground";

// The centered modal popup surface shared by dialog + alert-dialog. The sizing (dialog's
// `flex max-h-full flex-col` + per-size max-width vs alert-dialog's fixed `max-w-cq-sm`) is per-seal.
export const MODAL_SURFACE = "w-full rounded-card border border-border bg-popover p-section text-popover-foreground shadow-overlay";

// The anchored-popup ITEM row — byte-identical between autocomplete and combobox; select layers
// `justify-between gap-row` on top. (Menu's row is a genuinely different recipe — cursor-default,
// px-row, min-h-control-sm — and stays its own `itemBase`.)
export const ITEM_ROW = `flex min-h-touch-target cursor-pointer select-none items-center rounded-control px-block py-field text-body leading-body text-foreground outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground ${DISABLED_STATE}`;
