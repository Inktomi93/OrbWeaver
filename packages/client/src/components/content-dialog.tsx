import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogFooter, DialogHeader, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import type { StackProps } from "@orb/ui/layout";
import { DialogBody, Row } from "@orb/ui/layout";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { DIALOG_VERBS } from "#lib";

type DialogPopupProps = ComponentProps<typeof DialogPopup>;
// The popup's look rides on named props of the composite, so the variant census reads the DialogPopup they land on.
const POPUP_LOOK = ["size", "anchor", "className", "keepMounted", "forceRender", "focusTarget", "spaced", "clearsClose", "stickyHeader"] as const;
type PopupLook = (typeof POPUP_LOOK)[number];

export interface ContentDialogProps extends Omit<ComponentProps<typeof Dialog>, "children"> {
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly size?: DialogPopupProps["size"];
  readonly anchor?: DialogPopupProps["anchor"];
  readonly popupProps?: Omit<DialogPopupProps, PopupLook> & {
    readonly "data-testid"?: string;
    readonly "data-slot"?: string;
    readonly "data-chat-id"?: string;
    readonly "data-variant-id"?: string;
  };
  readonly titleProps?: Omit<ComponentProps<typeof DialogTitle>, "focusTarget" | "clearsClose" | "className" | "truncate">;
  /** The title holds one line beside the header's actions. */
  readonly titleTruncate?: boolean;
  readonly bodyProps?: Omit<ComponentProps<"div">, "className">;
  /** The body takes programmatic focus, so it draws no outline of its own. */
  readonly bodyFocusTarget?: boolean;
  readonly bodyContainer?: StackProps["container"];
  readonly headerLeading?: ReactNode;
  readonly headerActions?: ReactNode;
  readonly footer?: ReactNode;
}

/** Owns the named header and scrolling body; native focus and dismissal props reach the dialog seal. */
export function ContentDialog({
  title,
  children,
  size,
  anchor,
  popupProps,
  titleProps,
  titleTruncate,
  bodyProps,
  bodyFocusTarget,
  bodyContainer,
  headerLeading,
  headerActions,
  footer,
  ...root
}: ContentDialogProps): ReactElement {
  return (
    <Dialog {...root}>
      <DialogPopup {...popupProps} size={size} anchor={anchor} spaced={true}>
        <DialogHeader wrap={true}>
          <Row align="center" gap="row" className="min-inline-0" floor="title" grow={true}>
            {headerLeading}
            <DialogTitle {...titleProps} truncate={titleTruncate}>
              {title}
            </DialogTitle>
          </Row>
          {headerActions}
        </DialogHeader>
        <DialogBody {...bodyProps} container={bodyContainer} focusTarget={bodyFocusTarget} grow={true} gap="block">
          {children}
          {footer === undefined ? null : <DialogFooter>{footer}</DialogFooter>}
        </DialogBody>
      </DialogPopup>
    </Dialog>
  );
}

/** A native dismiss control shared by the viewer and picker composites. */
export function ContentDialogClose(): ReactElement {
  return (
    <DialogClose
      render={
        <Button variant="ghost" size="sm">
          {DIALOG_VERBS.close}
        </Button>
      }
    />
  );
}
