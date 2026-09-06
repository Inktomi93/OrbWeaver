// ModalHost — the shell's one modal seam. Reads the open modal id from the shell store and renders the
// registry-owned body inside a single @orb/ui <Dialog>, or — for a `presentation: "drawer"` def — a
// bottom <Drawer> sheet. A DECLARED-PLANNED modal (`body: { planned }`) renders its title as a
// placeholder. Controlled by the store: closing calls `closeModal`.

import { Button } from "@orb/ui/button";
import type { DialogPopupProps } from "@orb/ui/dialog";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Drawer, DrawerClose, DrawerPopup, DrawerTitle } from "@orb/ui/drawer";
import { Icon, X } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
import type { ModalDefinition, ModalSlotId } from "#state";
import { useModalRegistry } from "#state";
import { SectionPlaceholder } from "./section-placeholder.tsx";

export interface ModalHostProps {
  readonly openModal: ModalSlotId | null;
  /** Themed portal target — Base UI portals the Dialog/Drawer here instead of `<body>` so it inherits the active theme's tokens. */
  readonly container?: DialogPopupProps["container"];
  readonly onClose: () => void;
}

/**
 * The RENDERED trigger that opens `modalId`, if the current viewport draws one. Rail buttons and the topbar
 * command chip stamp `data-modal-trigger` with the id they open; `getClientRects()` is the visibility test
 * because the phone and the desktop each draw a different subset of them.
 */
function visibleModalTrigger(modalId: ModalSlotId): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-modal-trigger]")).find(
    (element) => element.dataset["modalTrigger"] === modalId && element.getClientRects().length > 0,
  );
}

/** The def's body — a real render, or the DECLARED-PLANNED placeholder (mirror the section content-none). */
function modalBody(def: ModalDefinition): ReactNode {
  return typeof def.body === "function" ? def.body() : <SectionPlaceholder title={def.title} description={def.body.planned} weave={true} />;
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
      def.onClose?.();
      onClose();
    }
  };

  if (def.presentation === "drawer") {
    return <DrawerModal key={openModal} body={body} container={container} def={def} onOpenChange={onOpenChange} />;
  }

  // THIS LOOKUP IS NOT AN ESCAPE PATH (owner ruling 2026-09-06, #1789) — same intrinsic-door class as
  // `rail.tsx`'s `mobile-tab` read (see its comment there for the full telling): the focus-return fallback
  // reads its own target the only place that target is declared, rather than re-filing it as a
  // parallel id.
  const mobileSheetModalId = registry.list().find((modal) => modal.trigger.placement === "mobile-tab")?.id;
  return <DialogModal body={body} container={container} def={def} mobileSheetModalId={mobileSheetModalId} onOpenChange={onOpenChange} />;
}

interface DrawerModalProps {
  readonly body: ReactNode;
  readonly container?: DialogPopupProps["container"];
  readonly def: ModalDefinition;
  readonly onOpenChange: (nextOpen: boolean) => void;
}

function DrawerModal({ body, container, def, onOpenChange }: DrawerModalProps): ReactElement {
  // Base UI asks the old popup for finalFocus after a replacement Dialog has mounted. Only a close
  // initiated by this Drawer should restore its captured trigger; replacing the shared modal slot never
  // sends this Drawer an onOpenChange(false), so its queued cleanup must leave the Dialog's initialFocus.
  const closeRequestedRef = useRef(false);
  const onDrawerOpenChange = (nextOpen: boolean): void => {
    closeRequestedRef.current = !nextOpen;
    onOpenChange(nextOpen);
  };
  const resolveDrawerFinalFocus = (): boolean => closeRequestedRef.current;

  return (
    <Drawer open={true} onOpenChange={onDrawerOpenChange} side="bottom">
      <DrawerPopup side="bottom" container={container} finalFocus={resolveDrawerFinalFocus}>
        {/* sticky so the title + close stay in view as DrawerPopup's own scroll region scrolls. */}
        <header className="shell-modal-header sticky top-0 z-(--z-raised) shrink-0 bg-card">
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

/**
 * The centered-Dialog presentation, split out so its `finalFocus` capture runs at open time. ModalHost
 * mounts the Dialog already-open (store-driven, no DialogTrigger), so this child's useState initializer
 * captures the element focused at mount and hands it to `finalFocus` so focus returns there on close. A
 * You-sheet row is transient by design, so its disconnected capture returns to the visible mobile You tab.
 *
 * A CAPTURE MUST BE AN AFFORDANCE (#890) — the ruling above survives, its INPUT changed. `activeElement` is
 * never empty: with no affordance focused it is `document.body`, and the shell's programmatic-only stops
 * (`<main tabindex="-1">`, the skip target, this Dialog's own body div) hold focus routinely. Every one of
 * those is CONNECTED, so the capture branch handed Base UI a landmark, Base UI had nothing to restore to,
 * and the close dumped focus at the top of the document (both measured on the ⌘K path: `BODY` → the "Skip to
 * content" link, and `MAIN[aria-label="Chats content"]` → a content-control button). That is what made the
 * palette's focus return FLAKE: `useCommandShortcut` focused the durable trigger one frame ahead purely so
 * this snapshot would see it, and anything that moved focus in between — Chromium's own restoration after a
 * Meta accelerator is the documented one — left a landmark in the snapshot instead. So the capture is now
 * `tabIndex >= 0` only (a real tab stop, i.e. something a user could return to), and the fallback is
 * DECLARED rather than guessed: every registry-owned trigger carries `data-modal-trigger="<its modal id>"`,
 * so a modal opened with no affordance focused returns to its own trigger and nobody pre-focuses anything.
 */
function DialogModal({
  body,
  container,
  def,
  mobileSheetModalId,
  onOpenChange,
}: {
  readonly body: ReactNode;
  readonly container: DialogPopupProps["container"];
  readonly def: ModalDefinition;
  readonly mobileSheetModalId: ModalSlotId | undefined;
  readonly onOpenChange: (nextOpen: boolean) => void;
}): ReactElement {
  const [focusReturn] = useState(() => {
    const focused = document.activeElement;
    const trigger = focused instanceof HTMLElement && focused.tabIndex >= 0 ? focused : null;
    // `trigger?.closest(…) !== null` was INVERTED: with no capturable trigger the optional chain yields
    // `undefined`, which is `!== null`, so "nobody had focus" classified as "opened from the You sheet"
    // and `resolveFinalFocus` went hunting for a mobile sheet tab to hand focus to. Ask the two questions
    // the flag actually means.
    return { fromYouSheet: trigger !== null && trigger.closest('[data-slot="you-sheet"]') !== null, trigger };
  });
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const resolveFinalFocus = (): HTMLElement | boolean => {
    if (focusReturn.trigger?.isConnected === true) {
      return focusReturn.trigger;
    }
    // A transient You-sheet row returns to the sheet's own tab; anything else returns to the modal's own
    // declared trigger, which is the only durable answer when the open captured nobody.
    if (focusReturn.fromYouSheet && mobileSheetModalId !== undefined) {
      return visibleModalTrigger(mobileSheetModalId) ?? true;
    }
    return visibleModalTrigger(def.id) ?? true;
  };

  // Shell modals (full/xl) fill the popup height; content modals size to content but still scroll internally when tall.
  const isShellModal = def.size === "full" || def.size === "xl";
  // exactOptionalPropertyTypes: spread size only when set, never pass an explicit undefined.
  const sizeProp = def.size === undefined ? {} : { size: def.size };
  const bodyClass = isShellModal ? "relative min-h-0 flex-1 overflow-y-auto outline-none" : "relative min-h-0 overflow-y-auto outline-none";
  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      {/* OPENING FOCUS LANDS IN THE BODY, NOT ON CLOSE (side-eye 2026-08-16 ARIA rider). Base UI's default
          initial focus is the popup's first TABBABLE descendant, and this header puts the dismiss button
          ahead of every one of them — so every shell modal opened with focus on `Close` and the first Enter
          threw the modal away. The body is the content the reader came for, so it takes focus as a
          programmatic-only stop (`tabIndex={-1}` + `outline-none`: it is not a tab stop and must not paint a
          ring, exactly like the section surfaces' focus targets); Tab from there reaches the first real
          control, Escape still closes, and `finalFocus` still returns to the trigger. */}
      <DialogPopup {...sizeProp} container={container} finalFocus={resolveFinalFocus} initialFocus={(): HTMLElement | boolean => bodyRef.current ?? true}>
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
        <div className={bodyClass} ref={bodyRef} tabIndex={-1}>
          {body}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
