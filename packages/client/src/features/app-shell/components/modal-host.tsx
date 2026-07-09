// ModalHost — the shell's ONE modal seam. Reads the open modal id from the shell store and renders the
// id-paired MODAL_SLOTS body inside a single @orb/ui <Dialog> (focus-trap · Esc · scroll-lock come free),
// OR — for a `presentation: "drawer"` def (the mobile "You" sheet, L6/J12) — a bottom <Drawer> sheet
// (swipe-to-dismiss · focus-trap · Esc come free). Controlled by the store: closing (Esc/backdrop/close/
// swipe) calls `closeModal`. One host for every rail/topbar/avatar modal keeps the trigger↔body pairing
// the single source of truth (§11.5).

import { Button } from "@orb/ui/button";
import type { DialogPopupProps } from "@orb/ui/dialog";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Drawer, DrawerClose, DrawerPopup, DrawerTitle } from "@orb/ui/drawer";
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
  /** Themed portal target (D44 §12.1) — Base UI portals the Dialog/Drawer HERE instead of `<body>`, so
   *  the overlay inherits the active theme's tokens (a body-portaled modal escapes the app root's
   *  `<ThemeScope>` and renders Hearth defaults under a custom theme). The app root owns the node. */
  readonly container?: DialogPopupProps["container"];
  readonly onClose: () => void;
}

export function ModalHost({
  openModal,
  modals,
  container,
  onClose,
}: ModalHostProps): ReactElement | null {
  if (openModal === null) {
    return null;
  }
  const def = MODAL_SLOTS[openModal];
  const injected = modals?.[openModal];
  const body = injected ?? def.render();
  // `onOpenChange` fires on Esc/backdrop/close/swipe — funnel every close to the store's `closeModal`.
  const onOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      onClose();
    }
  };

  // The mobile "You" sheet (L6/J12) presents as a bottom Drawer instead of a centered Dialog — same
  // store control, same header/close grammar; Base UI Drawer adds swipe-to-dismiss for free.
  if (def.presentation === "drawer") {
    return (
      <Drawer open={true} onOpenChange={onOpenChange} side="bottom">
        <DrawerPopup side="bottom" container={container}>
          {/* The header pins to the top of the drawer's own scroll region (DrawerPopup wraps children in
              its scrollable Content) — `sticky top-0` keeps the title + close in view as the body scrolls;
              `bg-card` matches the drawer surface so content can't bleed under it. */}
          <header className="shell-modal-header sticky top-0 z-(--z-sticky) shrink-0 bg-card">
            <DrawerTitle>{def.title}</DrawerTitle>
            <DrawerClose
              render={
                <Button intent="ghost" size="icon" aria-label="Close">
                  <Icon icon={X} size="sm" />
                </Button>
              }
            />
          </header>
          {body}
        </DrawerPopup>
      </Drawer>
    );
  }

  // The @orb/ui DialogPopup is a capped flex COLUMN (max-h-full) — pin the header and scroll ONLY the
  // interior body region, NEVER the backdrop (§13.7 scroll ownership; the receipts showed a scrollable
  // backdrop taking the title + close out of view). SHELL modals (full/xl) FILL the popup height
  // (`flex-1`); content modals (sm/md/lg) size to content but still scroll internally when tall
  // (`min-h-0` + overflow, no grow). Shell tier — raw utility classes are legal HERE (§11.0).
  const isShellModal = def.size === "full" || def.size === "xl";
  // `exactOptionalPropertyTypes`: spread size only when set — never pass an explicit `undefined`.
  const sizeProp = def.size === undefined ? {} : { size: def.size };
  const bodyClass = isShellModal ? "min-h-0 flex-1 overflow-y-auto" : "min-h-0 overflow-y-auto";
  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogPopup {...sizeProp} container={container}>
        <header className="shell-modal-header shrink-0">
          <DialogTitle>{def.title}</DialogTitle>
          <DialogClose
            render={
              <Button intent="ghost" size="icon" aria-label="Close">
                <Icon icon={X} size="sm" />
              </Button>
            }
          />
        </header>
        <div className={bodyClass}>{body}</div>
      </DialogPopup>
    </Dialog>
  );
}
