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
import type { VariantProps } from "tailwind-variants";
import { usePortalContainer } from "#lib";
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

export interface DialogPopupProps
  extends Omit<BasePopupProps, "className">,
    VariantProps<typeof dialogVariants> {
  className?: string;
  /** Portal target — defaults to the themed portal root from context (usePortalContainer, D44 §12.1); an explicit node/ref overrides (ModalHost). */
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
  const { className, children, container, keepMounted, forceRender, size, ...rest } = props;
  // Default the Portal target to the themed root from context (D44 §12.1), so a feature-level dialog that
  // passes no `container` still inherits the active <ThemeScope> instead of painting Hearth chrome from
  // <body>; an explicit `container` (ModalHost) still wins. Sentinel is undefined, never null (a null
  // container makes floating-ui WAIT — see portal-container.ts).
  const portalContainer = usePortalContainer();
  // The size variant reshapes BOTH the viewport (full drops its gutter) and the popup (width clamp /
  // full-bleed), so compute a per-call slot set; backdrop is size-independent but reads cleanly here too.
  const sized = dialogVariants({ size });
  return (
    <BaseDialog.Portal container={container ?? portalContainer} keepMounted={keepMounted}>
      <BaseDialog.Backdrop
        className={sized.backdrop()}
        data-slot="dialog-backdrop"
        forceRender={forceRender}
      />
      <BaseDialog.Viewport className={sized.viewport()} data-slot="dialog-viewport">
        <BaseDialog.Popup className={sized.popup({ className })} data-slot="dialog-popup" {...rest}>
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
