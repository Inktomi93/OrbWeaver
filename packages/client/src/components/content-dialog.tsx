import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogFooter, DialogHeader, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Icon, X } from "@orb/ui/icons";
import type { StackProps } from "@orb/ui/layout";
import { DialogBody, Row } from "@orb/ui/layout";
import type { ComponentProps, ReactElement, ReactNode, Ref } from "react";
import { DIALOG_VERBS } from "#lib";

type DialogPopupProps = ComponentProps<typeof DialogPopup>;
// The popup's look rides on named props of the composite, so the variant census reads the DialogPopup they land on.
const POPUP_LOOK = ["size", "anchor", "keepMounted", "forceRender", "focusTarget", "spaced", "clearsClose", "stickyHeader"] as const;
type PopupLook = (typeof POPUP_LOOK)[number];

// The way out, drawn by the composite so a caller's header or footer cannot lose it; touch has no Escape.
type ContentDismiss =
  | {
      readonly at: "header";
      /** The close glyph the shell's own modals wear, not the verb. @defaultValue false */
      readonly glyph?: boolean;
      readonly control?: Ref<HTMLButtonElement>;
    }
  | {
      readonly at: "footer";
      readonly label: string;
      /** The verb is the dialog's main act, as Done is on an autosaving editor. @defaultValue false */
      readonly primary?: boolean;
      readonly control?: Ref<HTMLButtonElement>;
    };

export interface ContentDialogProps extends Omit<ComponentProps<typeof Dialog>, "children"> {
  readonly title: ReactNode;
  readonly dismiss: ContentDismiss;
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
  /** Actions in one group with the header's dismiss. */
  readonly headerActions?: ReactNode;
  /** Actions after the footer's dismiss. */
  readonly footer?: ReactNode;
}

/** A composite that draws its dismiss in the header by default. */
export type HeaderDismissDialogProps = Omit<ContentDialogProps, "dismiss"> & { readonly dismiss?: Extract<ContentDismiss, { at: "header" }> };

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
  dismiss,
  ...root
}: ContentDialogProps): ReactElement {
  const close = dismiss.at === "header" ? <ContentDialogClose dismiss={dismiss} /> : null;
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
          {headerActions === undefined ? (
            close
          ) : (
            <Row align="center" className="shrink-0" wrap={true} cap="fit" gap="row">
              {headerActions}
              {close}
            </Row>
          )}
        </DialogHeader>
        <DialogBody {...bodyProps} container={bodyContainer} focusTarget={bodyFocusTarget} grow={true} gap="block">
          {children}
          {dismiss.at === "footer" ? (
            <DialogFooter>
              <DialogClose
                render={
                  <Button
                    {...(dismiss.primary === true ? {} : { variant: "ghost" as const })}
                    {...(dismiss.control === undefined ? {} : { ref: dismiss.control })}
                  >
                    {dismiss.label}
                  </Button>
                }
              />
              {footer}
            </DialogFooter>
          ) : null}
          {dismiss.at === "header" && footer !== undefined ? <DialogFooter>{footer}</DialogFooter> : null}
        </DialogBody>
      </DialogPopup>
    </Dialog>
  );
}

function ContentDialogClose({ dismiss }: { readonly dismiss: Extract<ContentDismiss, { at: "header" }> }): ReactElement {
  return (
    <DialogClose
      render={
        dismiss.glyph === true ? (
          <Button {...(dismiss.control === undefined ? {} : { ref: dismiss.control })} variant="ghost" square={true} aria-label={DIALOG_VERBS.close}>
            <Icon icon={X} size="sm" />
          </Button>
        ) : (
          <Button {...(dismiss.control === undefined ? {} : { ref: dismiss.control })} className="shrink-0" variant="ghost" size="sm">
            {DIALOG_VERBS.close}
          </Button>
        )
      }
    />
  );
}
