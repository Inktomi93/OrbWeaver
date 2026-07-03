import type {
  DialogCloseProps as BaseCloseProps,
  DialogDescriptionProps as BaseDescriptionProps,
  DialogPopupProps as BasePopupProps,
  DialogPortalProps as BasePortalProps,
  DialogRootProps as BaseRootProps,
  DialogTitleProps as BaseTitleProps,
  DialogTriggerProps as BaseTriggerProps,
} from "@base-ui/react/dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactElement } from "react";
import { dialogVariants } from "./variants";

const slots = dialogVariants();

/**
 * Modal dialog root — seals Base UI Dialog (focus trap, Esc-to-close, and scroll lock come free;
 * do not reimplement). State-only: renders no element. Generic over the detached-handle `Payload`:
 * pass a `handle` (see `createDialogHandle`) plus render-function children to open imperatively with
 * a payload — `<Dialog handle={h}>{({ payload }) => …}</Dialog>`.
 * `<Dialog><DialogTrigger>Open</DialogTrigger><DialogPopup>…</DialogPopup></Dialog>`
 * Spec: ui-package-design §6.1 / §13 R2 / UI-Arch §2 (Base UI is THE headless primitive, D42).
 */
export function Dialog<Payload = unknown>(props: BaseRootProps<Payload>): ReactElement {
  return <BaseDialog.Root {...props} />;
}

/**
 * Opens the dialog. Unstyled passthrough — compose your own control via `render` (never asChild).
 * Accepts `handle` + `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven dialog.
 * `<DialogTrigger render={<Button>Open</Button>} />`
 * Spec: ui-package-design §6.1 / §13 R2; UI-Arch §2 (`render` prop replaces the asChild footgun).
 */
export function DialogTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  return <BaseDialog.Trigger {...props} />;
}

export interface DialogPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  /** Portal target — render the overlay into a specific container (default: document.body). */
  container?: BasePortalProps["container"];
  /** Keep the portal mounted while the dialog is closed (preserve DOM/animations). @defaultValue false */
  keepMounted?: BasePortalProps["keepMounted"];
  /**
   * Force-render the backdrop even when Base UI would suppress it — required for the backdrop of a
   * dialog nested inside another dialog (suppressed by default). @defaultValue false
   */
  forceRender?: boolean;
}

/**
 * The dialog surface — bundles Portal → Backdrop (`bg-scrim`) → Viewport → Popup so the anatomy
 * cannot be mis-assembled. Sits at `--z-modal`. `container`/`keepMounted` reach the Portal;
 * `forceRender` reaches the Backdrop (for nested-dialog backdrops).
 * `<DialogPopup><DialogTitle>Settings</DialogTitle>…</DialogPopup>`
 * Spec: ui-package-design §6.1 dictate — Root/Trigger/Portal/Backdrop/Popup/Title/Description/Close.
 */
export function DialogPopup(props: DialogPopupProps): ReactElement {
  const { className, children, container, keepMounted, forceRender, ...rest } = props;
  return (
    <BaseDialog.Portal container={container} keepMounted={keepMounted}>
      <BaseDialog.Backdrop
        className={slots.backdrop()}
        data-slot="dialog-backdrop"
        forceRender={forceRender}
      />
      <BaseDialog.Viewport className={slots.viewport()} data-slot="dialog-viewport">
        <BaseDialog.Popup className={slots.popup({ className })} data-slot="dialog-popup" {...rest}>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}

export interface DialogTitleProps extends Omit<BaseTitleProps, "className"> {
  className?: string;
}

/**
 * Accessible dialog heading (labels the popup for screen readers).
 * `<DialogTitle>Delete character?</DialogTitle>`
 * Spec: ui-package-design §6.1.
 */
export function DialogTitle(props: DialogTitleProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseDialog.Title className={slots.title({ className })} {...rest} />;
}

export interface DialogDescriptionProps extends Omit<BaseDescriptionProps, "className"> {
  className?: string;
}

/**
 * Supporting copy under the title (wired to `aria-describedby`).
 * `<DialogDescription>This cannot be undone.</DialogDescription>`
 * Spec: ui-package-design §6.1.
 */
export function DialogDescription(props: DialogDescriptionProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseDialog.Description className={slots.description({ className })} {...rest} />;
}

/**
 * Closes the dialog. Unstyled passthrough — compose your own control via `render`.
 * `<DialogClose render={<Button variant="ghost">Cancel</Button>} />`
 * Spec: ui-package-design §6.1.
 */
export function DialogClose(props: BaseCloseProps): ReactElement {
  return <BaseDialog.Close {...props} />;
}
