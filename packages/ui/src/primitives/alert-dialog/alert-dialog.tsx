import type {
  AlertDialogCloseProps as BaseCloseProps,
  AlertDialogDescriptionProps as BaseDescriptionProps,
  AlertDialogPopupProps as BasePopupProps,
  AlertDialogPortalProps as BasePortalProps,
  AlertDialogRootProps as BaseRootProps,
  AlertDialogTitleProps as BaseTitleProps,
  AlertDialogTriggerProps as BaseTriggerProps,
} from "@base-ui/react/alert-dialog";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import type { HTMLAttributes, ReactElement } from "react";
import { usePortalContainer } from "#lib";
import { alertDialogVariants } from "./variants.ts";

const slots = alertDialogVariants();

// Unlike Dialog, intentionally NOT dismissible by backdrop click — a destructive action needs an explicit choice.
export function AlertDialog<Payload = unknown>(props: BaseRootProps<Payload>): ReactElement {
  return <BaseAlertDialog.Root {...props} />;
}

/** Accepts `handle` + `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven dialog. */
export function AlertDialogTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  return <BaseAlertDialog.Trigger {...props} />;
}

export interface AlertDialogPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  /** Defaults to the themed portal root from context; an explicit node/ref overrides. */
  container?: BasePortalProps["container"];
  keepMounted?: BasePortalProps["keepMounted"];
  /** Force-render the backdrop even when Base UI would suppress it (a nested alert dialog's backdrop). */
  forceRender?: boolean;
}

/** Bundles Portal → Backdrop → Viewport → Popup so the anatomy cannot be mis-assembled. */
export function AlertDialogPopup(props: AlertDialogPopupProps): ReactElement {
  const { className, children, container, keepMounted, forceRender, ...rest } = props;
  const portalContainer = usePortalContainer();
  return (
    <BaseAlertDialog.Portal container={container ?? portalContainer} keepMounted={keepMounted}>
      <BaseAlertDialog.Backdrop className={slots.backdrop()} data-slot="alert-dialog-backdrop" forceRender={forceRender} />
      <BaseAlertDialog.Viewport className={slots.viewport()} data-slot="alert-dialog-viewport">
        <BaseAlertDialog.Popup className={slots.popup({ className })} data-slot="alert-dialog-popup" {...rest}>
          {children}
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Viewport>
    </BaseAlertDialog.Portal>
  );
}

export interface AlertDialogTitleProps extends Omit<BaseTitleProps, "className"> {
  className?: string;
}

export function AlertDialogTitle(props: AlertDialogTitleProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseAlertDialog.Title className={slots.title({ className })} {...rest} />;
}

export interface AlertDialogDescriptionProps extends Omit<BaseDescriptionProps, "className"> {
  className?: string;
}

export function AlertDialogDescription(props: AlertDialogDescriptionProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseAlertDialog.Description className={slots.description({ className })} {...rest} />;
}

export interface AlertDialogActionsProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/** Right-aligned action row for the cancel/confirm pair — a plain layout slot (no Base UI part). */
export function AlertDialogActions(props: AlertDialogActionsProps): ReactElement {
  const { className, ...rest } = props;
  return <div className={slots.actions({ className })} data-slot="alert-dialog-actions" {...rest} />;
}

/** Use for BOTH the cancel and confirm control — the confirm fires the destructive action via its own `onClick`. */
export function AlertDialogClose(props: BaseCloseProps): ReactElement {
  return <BaseAlertDialog.Close {...props} />;
}
