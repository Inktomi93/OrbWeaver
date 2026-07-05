// ModalHost — the shell's ONE dialog seam. Reads the open modal id from the shell store and renders
// the id-paired MODAL_SLOTS body inside a single @orb/ui <Dialog> (focus-trap · Esc · scroll-lock
// come free). Controlled by the store: closing (Esc/backdrop/close) calls `closeModal`. One host for
// every rail/topbar/avatar modal keeps the trigger↔body pairing the single source of truth (§11.5).

import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the status-chip.tsx precedent).
import { Icon, X } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import type { ModalSlotId } from "#state";
import { MODAL_SLOTS } from "../lib/modal-slots";

export interface ModalHostProps {
  readonly openModal: ModalSlotId | null;
  /** Route-INJECTED modal bodies (keeps the shell domain-agnostic — it renders a ReactNode slot, never
   *  imports a feature). A supplied body WINS over the static `MODAL_SLOTS` placeholder; the id keeps
   *  its `MODAL_SLOTS` title. Bodies are lazy — only the open modal's node is ever mounted. */
  readonly modals?: Partial<Record<ModalSlotId, ReactNode>> | undefined;
  readonly onClose: () => void;
}

export function ModalHost({ openModal, modals, onClose }: ModalHostProps): ReactElement | null {
  if (openModal === null) {
    return null;
  }
  const def = MODAL_SLOTS[openModal];
  const injected = modals?.[openModal];
  const body = injected ?? def.render();
  // Full-bleed modals (J11 settings) make the popup a flex COLUMN so the header pins to the top and the
  // body fills the remaining height (its own surface scrolls); `min-h-0` lets that inner scroll work.
  // Non-full modals are untouched — the body renders inline exactly as before (shell tier — raw utility
  // classes are legal HERE, §11.0).
  const isFull = def.size === "full";
  // `exactOptionalPropertyTypes`: spread size/className only when set — never pass an explicit `undefined`.
  const sizeProp = def.size === undefined ? {} : { size: def.size };
  const classProp = isFull ? { className: "flex flex-col" } : {};
  return (
    <Dialog
      open={true}
      onOpenChange={(nextOpen): void => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogPopup {...sizeProp} {...classProp}>
        <header className="shell-modal-header">
          <DialogTitle>{def.title}</DialogTitle>
          <DialogClose
            render={
              <Button intent="ghost" size="icon" aria-label="Close">
                <Icon icon={X} size="sm" />
              </Button>
            }
          />
        </header>
        {isFull ? <div className="min-h-0 flex-1">{body}</div> : <>{body}</>}
      </DialogPopup>
    </Dialog>
  );
}
