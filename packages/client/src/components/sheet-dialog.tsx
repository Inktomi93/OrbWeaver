// The one phone bottom sheet: a drawer under a sticky header that holds its title and Close while the body scrolls beneath. Features reach
// the drawer primitive only through this composite (`orb/sheet-via-composite`), so every sheet draws the same chrome.

import { Button } from "@orb/ui/button";
import { DialogHeader } from "@orb/ui/dialog";
import { Drawer, DrawerClose, DrawerPopup, DrawerTitle, DrawerVirtualKeyboardProvider } from "@orb/ui/drawer";
import { Icon, X } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { DIALOG_VERBS } from "#lib";

type DrawerRootProps = ComponentProps<typeof Drawer>;
type DrawerPopupProps = ComponentProps<typeof DrawerPopup>;

export interface SheetDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (nextOpen: boolean) => void;
  readonly title: ReactNode;
  /** The title's id, for a body that names itself by the title (a commit modal's form). */
  readonly titleId?: string;
  /** Themed portal target; Base UI portals the sheet here so it inherits the active theme's tokens. */
  readonly container?: DrawerPopupProps["container"];
  /** Where focus goes on close; `false` leaves it where it is. */
  readonly finalFocus?: DrawerPopupProps["finalFocus"];
  /** How the sheet holds the page behind it. Base UI's default is a full modal. */
  readonly modal?: DrawerRootProps["modal"];
  readonly children: ReactNode;
}

/**
 * A bottom sheet with the sticky dialog header and the keyboard-aware wrap. The provider wraps the popup and never sits inside it:
 * it reads the viewport out of the drawer store, and without it iOS covers a sheet's fields with the keyboard, because
 * `interactive-widget=resizes-content` is inert there. A body that pins an input to the sheet's foot reads
 * `var(--drawer-keyboard-inset, 0px)`, always with the `0px` fallback: the provider sets it only while the keyboard is aligned.
 */
export function SheetDialog({ open, onOpenChange, title, titleId, container, finalFocus, modal, children }: SheetDialogProps): ReactElement {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} {...(modal === undefined ? {} : { modal })}>
      <DrawerVirtualKeyboardProvider>
        <DrawerPopup {...(container === undefined ? {} : { container })} {...(finalFocus === undefined ? {} : { finalFocus })}>
          {/* Sticky so the title and Close stay in view as the sheet scrolls, except where the short-box law scrolls them away. Beside
              Close the title wraps by its words and keeps Close on its line until a word cannot fit, as a dialog's does. */}
          <DialogHeader sticky={true} wrap={true}>
            <Row align="center" grow={true} minWidth="word">
              <DrawerTitle {...(titleId === undefined ? {} : { id: titleId })}>{title}</DrawerTitle>
            </Row>
            <DrawerClose
              render={
                <Button variant="ghost" square={true} aria-label={DIALOG_VERBS.close}>
                  <Icon icon={X} size="sm" />
                </Button>
              }
            />
          </DialogHeader>
          {children}
        </DrawerPopup>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}
