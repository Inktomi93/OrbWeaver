// ModalHost — the shell's one modal seam. Reads the open modal id from the shell store and renders the
// registry-owned body inside a single @orb/ui <Dialog>, or — for a `presentation: "drawer"` def — a
// bottom <Drawer> sheet. A DECLARED-PLANNED modal (`body: { planned }`) renders its title as a
// placeholder. Controlled by the store: closing calls `closeModal`.

import { Button } from "@orb/ui/button";
import type { DialogPopupProps } from "@orb/ui/dialog";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Drawer, DrawerClose, DrawerPopup, DrawerTitle } from "@orb/ui/drawer";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the status-chip.tsx precedent).
import { Icon, X } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import type { ModalDefinition, ModalSlotId } from "#state";
import { useModalRegistry } from "#state";
import { SectionPlaceholder } from "./section-placeholder";

export interface ModalHostProps {
  readonly openModal: ModalSlotId | null;
  /** Themed portal target — Base UI portals the Dialog/Drawer here instead of `<body>` so it inherits the active theme's tokens. */
  readonly container?: DialogPopupProps["container"];
  readonly onClose: () => void;
}

/** The def's body — a real render, or the DECLARED-PLANNED placeholder (mirror the section content-none). */
function modalBody(def: ModalDefinition): ReactNode {
  return typeof def.body === "function" ? (
    def.body()
  ) : (
    <SectionPlaceholder title={def.title} description={def.body.planned} weave={true} />
  );
}

export function ModalHost({ openModal, container, onClose }: ModalHostProps): ReactElement | null {
  const registry = useModalRegistry();
  if (openModal === null) {
    return null;
  }
  const def = registry.get(openModal);
  const body = modalBody(def);
  const onOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      onClose();
    }
  };

  if (def.presentation === "drawer") {
    return (
      <Drawer open={true} onOpenChange={onOpenChange} side="bottom">
        <DrawerPopup side="bottom" container={container}>
          {/* sticky so the title + close stay in view as DrawerPopup's own scroll region scrolls. */}
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

  return <DialogModal body={body} container={container} def={def} onOpenChange={onOpenChange} />;
}

/**
 * The centered-Dialog presentation, split out so its `finalFocus` capture runs at open time. ModalHost
 * mounts the Dialog already-open (store-driven, no DialogTrigger), so this child's useState initializer
 * captures the element focused at mount and hands it to `finalFocus` so focus returns there on close.
 */
function DialogModal({
  body,
  container,
  def,
  onOpenChange,
}: {
  readonly body: ReactNode;
  readonly container: DialogPopupProps["container"];
  readonly def: ModalDefinition;
  readonly onOpenChange: (nextOpen: boolean) => void;
}): ReactElement {
  const [capturedTrigger] = useState<HTMLElement | null>(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  // Shell modals (full/xl) fill the popup height; content modals size to content but still scroll internally when tall.
  const isShellModal = def.size === "full" || def.size === "xl";
  // exactOptionalPropertyTypes: spread size only when set, never pass an explicit undefined.
  const sizeProp = def.size === undefined ? {} : { size: def.size };
  const bodyClass = isShellModal ? "min-h-0 flex-1 overflow-y-auto" : "min-h-0 overflow-y-auto";
  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogPopup
        {...sizeProp}
        container={container}
        finalFocus={(): HTMLElement | boolean => capturedTrigger ?? true}
      >
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
