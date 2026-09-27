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
import { usePortalContainer, variantAttrs } from "#lib";
import { dialogVariants } from "./variants.ts";

const slots = dialogVariants();

export function Dialog<Payload = unknown>(props: BaseRootProps<Payload>): ReactElement {
  return <BaseDialog.Root {...props} />;
}

/** Accepts `handle` + `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven dialog. */
export function DialogTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  return <BaseDialog.Trigger {...props} />;
}

export interface DialogPopupProps extends Omit<BasePopupProps, "className">, VariantProps<typeof dialogVariants> {
  className?: string;
  /** Defaults to the themed portal root from context; an explicit node/ref overrides. */
  container?: BasePortalProps["container"];
  keepMounted?: BasePortalProps["keepMounted"];
  /** Force-render the backdrop even when Base UI would suppress it (a nested dialog's backdrop). */
  forceRender?: boolean;
}

/** Bundles Portal → Backdrop → Viewport → Popup so the anatomy cannot be mis-assembled. */
export function DialogPopup(props: DialogPopupProps): ReactElement {
  const { className, children, container, keepMounted, forceRender, size, anchor, ...rest } = props;
  const portalContainer = usePortalContainer();
  // The size and anchor variants reshape the viewport as well as the popup, so compute a per-call slot set.
  const sized = dialogVariants({ size, anchor });
  return (
    <BaseDialog.Portal container={container ?? portalContainer} keepMounted={keepMounted}>
      <BaseDialog.Backdrop className={sized.backdrop()} data-slot="dialog-backdrop" forceRender={forceRender} />
      <BaseDialog.Viewport className={sized.viewport()} data-slot="dialog-viewport">
        {/* STAMP SITE (#1097): the POPUP. `size` widths/heights the popup (the viewport only gets the
            matching gutter), and the popup is the painted dialog surface a census targets. */}
        <BaseDialog.Popup className={sized.popup({ className })} data-slot="dialog-popup" {...variantAttrs(dialogVariants, { size })} {...rest}>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}

export interface DialogTitleProps extends Omit<BaseTitleProps, "className"> {
  className?: string;
}

export function DialogTitle(props: DialogTitleProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseDialog.Title className={slots.title({ className })} {...rest} />;
}

export interface DialogDescriptionProps extends Omit<BaseDescriptionProps, "className"> {
  className?: string;
}

export function DialogDescription(props: DialogDescriptionProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseDialog.Description className={slots.description({ className })} {...rest} />;
}

export function DialogClose(props: BaseCloseProps): ReactElement {
  return <BaseDialog.Close {...props} />;
}
