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
import { alertDialogVariants } from "./variants";

const slots = alertDialogVariants();

/**
 * Confirm/destructive dialog root — seals Base UI AlertDialog (focus trap + Esc come free; unlike
 * Dialog it is intentionally NOT dismissible by backdrop click, so a destructive action needs an
 * explicit choice). State-only: renders no element.
 * `<AlertDialog><AlertDialogTrigger>Delete</AlertDialogTrigger><AlertDialogPopup>…</AlertDialogPopup></AlertDialog>`
 * Spec: ui-package-design §6.1 — the confirm/destructive dialog (delete character, reset refinery).
 */
export function AlertDialog<Payload = unknown>(props: BaseRootProps<Payload>): ReactElement {
  return <BaseAlertDialog.Root {...props} />;
}

/**
 * Opens the alert dialog. Unstyled passthrough — compose your own control via `render`.
 * Accepts `handle` + `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven dialog.
 * `<AlertDialogTrigger render={<Button intent="destructive">Delete</Button>} />`
 * Spec: ui-package-design §6.1 / §13 R2.
 */
export function AlertDialogTrigger<Payload = unknown>(
  props: BaseTriggerProps<Payload>,
): ReactElement {
  return <BaseAlertDialog.Trigger {...props} />;
}

export interface AlertDialogPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  /** Portal target — defaults to the themed portal root from context (usePortalContainer, D44 §12.1); an explicit node/ref overrides (ModalHost). */
  container?: BasePortalProps["container"];
  /** Keep the portal mounted while closed (preserve DOM/animations). @defaultValue false */
  keepMounted?: BasePortalProps["keepMounted"];
  /**
   * Force-render the backdrop even when Base UI would suppress it — required for the backdrop of an
   * alert dialog nested inside another dialog (suppressed by default). @defaultValue false
   */
  forceRender?: boolean;
}

/**
 * The alert surface — bundles Portal → Backdrop (`bg-scrim`) → Viewport → Popup so the anatomy
 * cannot be mis-assembled. Sits at `--z-modal`. `container`/`keepMounted` reach the Portal;
 * `forceRender` reaches the Backdrop (for nested-dialog backdrops).
 * `<AlertDialogPopup><AlertDialogTitle>Delete character?</AlertDialogTitle>…</AlertDialogPopup>`
 * Spec: ui-package-design §6.1 dictate — Root/Trigger/Portal/Backdrop/Popup/Title/Description/Close.
 */
export function AlertDialogPopup(props: AlertDialogPopupProps): ReactElement {
  const { className, children, container, keepMounted, forceRender, ...rest } = props;
  // Default the Portal target to the themed root from context (D44 §12.1) so a feature-level alert-dialog
  // inherits the active <ThemeScope> instead of Hearth chrome from <body>; an explicit `container` still
  // wins. Sentinel is undefined, never null (see portal-container.ts).
  const portalContainer = usePortalContainer();
  return (
    <BaseAlertDialog.Portal container={container ?? portalContainer} keepMounted={keepMounted}>
      <BaseAlertDialog.Backdrop
        className={slots.backdrop()}
        data-slot="alert-dialog-backdrop"
        forceRender={forceRender}
      />
      <BaseAlertDialog.Viewport className={slots.viewport()} data-slot="alert-dialog-viewport">
        <BaseAlertDialog.Popup
          className={slots.popup({ className })}
          data-slot="alert-dialog-popup"
          {...rest}
        >
          {children}
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Viewport>
    </BaseAlertDialog.Portal>
  );
}

export interface AlertDialogTitleProps extends Omit<BaseTitleProps, "className"> {
  className?: string;
}

/**
 * Accessible alert heading (labels the popup for screen readers).
 * `<AlertDialogTitle>Delete character?</AlertDialogTitle>`
 * Spec: ui-package-design §6.1.
 */
export function AlertDialogTitle(props: AlertDialogTitleProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseAlertDialog.Title className={slots.title({ className })} {...rest} />;
}

export interface AlertDialogDescriptionProps extends Omit<BaseDescriptionProps, "className"> {
  className?: string;
}

/**
 * Supporting copy under the title (wired to `aria-describedby`) — spell out the consequence here.
 * `<AlertDialogDescription>This permanently deletes the character.</AlertDialogDescription>`
 * Spec: ui-package-design §6.1.
 */
export function AlertDialogDescription(props: AlertDialogDescriptionProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseAlertDialog.Description className={slots.description({ className })} {...rest} />;
}

export interface AlertDialogActionsProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/**
 * Right-aligned action row for the cancel/confirm pair — a plain layout slot (no Base UI part).
 * Put the destructive confirm here as an `AlertDialogClose render={<Button intent="destructive">}`.
 * `<AlertDialogActions><AlertDialogClose>Cancel</AlertDialogClose>…</AlertDialogActions>`
 * Spec: ui-package-design §6.1 — a destructive-intent action slot.
 */
export function AlertDialogActions(props: AlertDialogActionsProps): ReactElement {
  const { className, ...rest } = props;
  return (
    <div className={slots.actions({ className })} data-slot="alert-dialog-actions" {...rest} />
  );
}

/**
 * Closes the alert dialog — use for BOTH the cancel and the confirm control (the confirm additionally
 * fires the destructive action via its own `onClick`). Unstyled passthrough — compose via `render`.
 * `<AlertDialogClose render={<Button intent="destructive" onClick={onDelete}>Delete</Button>} />`
 * Spec: ui-package-design §6.1.
 */
export function AlertDialogClose(props: BaseCloseProps): ReactElement {
  return <BaseAlertDialog.Close {...props} />;
}
