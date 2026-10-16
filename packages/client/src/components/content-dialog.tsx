import { Button } from "@orb/ui/button";
import { DIALOG_SCROLL_CLASS, Dialog, DialogClose, DialogFooter, DialogHeader, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import type { ComponentProps, ReactElement, ReactNode } from "react";

export interface ContentDialogProps extends Omit<ComponentProps<typeof Dialog>, "children"> {
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly popupProps?: ComponentProps<typeof DialogPopup> & {
    readonly "data-testid"?: string;
    readonly "data-slot"?: string;
    readonly "data-chat-id"?: string;
    readonly "data-variant-id"?: string;
  };
  readonly titleProps?: ComponentProps<typeof DialogTitle>;
  readonly bodyProps?: ComponentProps<typeof Stack>;
  readonly headerLeading?: ReactNode;
  readonly headerActions?: ReactNode;
  readonly footer?: ReactNode;
}

/** Owns the named header and scrolling body; native focus and dismissal props reach the dialog seal. */
export function ContentDialog({
  title,
  children,
  popupProps,
  titleProps,
  bodyProps,
  headerLeading,
  headerActions,
  footer,
  ...root
}: ContentDialogProps): ReactElement {
  return (
    <Dialog {...root}>
      <DialogPopup {...popupProps} className={`gap-block ${popupProps?.className ?? ""}`}>
        <DialogHeader>
          <Row align="center" gap="row" className="min-w-0">
            {headerLeading}
            <DialogTitle {...titleProps}>{title}</DialogTitle>
          </Row>
          {headerActions}
        </DialogHeader>
        <Stack {...bodyProps} className={`${DIALOG_SCROLL_CLASS} flex-1 ${bodyProps?.className ?? ""}`} gap="block">
          {children}
          {footer === undefined ? null : <DialogFooter>{footer}</DialogFooter>}
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

/** A native dismiss control shared by the viewer and picker composites. */
export function ContentDialogClose(): ReactElement {
  return (
    <DialogClose
      render={
        <Button intent="ghost" size="sm">
          Close
        </Button>
      }
    />
  );
}
