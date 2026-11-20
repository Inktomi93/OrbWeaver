// The open state every registry-modal trigger in shell chrome speaks, read from the store's one open slot, so every
// close path (the trigger, a scrim press, Escape, a row that navigates) clears it. It mirrors Base UI's dialog trigger
// contract; `data-popup-open` is not reused because the tooltip trigger on the same node owns it.

import type { ModalSlotId } from "#state";
import { useOpenModal } from "#state";

interface ModalTriggerAttributes {
  readonly "aria-haspopup"?: "dialog";
  readonly "aria-expanded"?: boolean;
  readonly "data-modal-open"?: "";
}

export interface ModalTriggerState {
  readonly open: boolean;
  /** Spread on the trigger. Empty for a control that opens no modal. */
  readonly attributes: ModalTriggerAttributes;
}

export function useModalTrigger(modalId: ModalSlotId | undefined): ModalTriggerState {
  const openModalId = useOpenModal();
  if (modalId === undefined) {
    return { open: false, attributes: {} };
  }
  const open = openModalId === modalId;
  return {
    open,
    attributes: open ? { "aria-haspopup": "dialog", "aria-expanded": true, "data-modal-open": "" } : { "aria-haspopup": "dialog", "aria-expanded": false },
  };
}
