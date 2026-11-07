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
import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { usePortalContainer, variantAttrs } from "#lib";
import { dialogVariants } from "./variants.ts";

const slots = dialogVariants();

export function Dialog<Payload = unknown>({ children, ...props }: BaseRootProps<Payload>): ReactElement {
  return <BaseDialog.Root {...props}>{children}</BaseDialog.Root>;
}

/** Accepts `handle` + `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven dialog. */
export function DialogTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  return <BaseDialog.Trigger {...props} />;
}

export interface DialogPopupProps
  extends Omit<BasePopupProps, "className">,
    Omit<VariantProps<typeof dialogVariants>, "footerPush" | "headerWrap" | "truncate"> {
  className?: string;
  /** Defaults to the themed portal root from context; an explicit node/ref overrides. */
  container?: BasePortalProps["container"];
  keepMounted?: BasePortalProps["keepMounted"];
  /** Force-render the backdrop even when Base UI would suppress it (a nested dialog's backdrop). */
  forceRender?: boolean;
}

/** Bundles Portal → Backdrop → Viewport → Popup so the anatomy cannot be mis-assembled. */
export function DialogPopup(props: DialogPopupProps): ReactElement {
  const { className, children, container, keepMounted, forceRender, size, anchor, spaced, ...rest } = props;
  const portalContainer = usePortalContainer();
  // The size and anchor variants reshape the viewport as well as the popup, so compute a per-call slot set.
  const sized = dialogVariants({ size, anchor, spaced });
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

export interface DialogTitleProps
  extends Omit<BaseTitleProps, "className">,
    Pick<VariantProps<typeof dialogVariants>, "clearsClose" | "focusTarget" | "truncate"> {
  className?: string;
}

export function DialogTitle(props: DialogTitleProps): ReactElement {
  const { className, clearsClose, focusTarget, truncate, ...rest } = props;
  return <BaseDialog.Title className={dialogVariants({ clearsClose, focusTarget, truncate }).title({ className })} {...rest} />;
}

export type DialogDescriptionProps = Omit<BaseDescriptionProps, "className">;

export function DialogDescription(props: DialogDescriptionProps): ReactElement {
  return <BaseDialog.Description className={slots.description()} {...props} />;
}

export function DialogClose(props: BaseCloseProps): ReactElement {
  return <BaseDialog.Close {...props} />;
}

export interface DialogFooterProps extends Omit<ComponentProps<"div">, "className"> {
  className?: string;
  /** The foot sets at the end of a body taller than its content. */
  push?: "blockEnd";
}

/**
 * The dialog's action row: stays in view at the bottom of the popup while the body scrolls. Render it as the
 * LAST child of a `DialogBody` (never of the popup itself, which must not scroll); every
 * dialog's Cancel/Confirm/Done row composes this rather than a Row.
 */
export function DialogFooter(props: DialogFooterProps): ReactElement {
  const { className, push, ...rest } = props;
  return <div className={dialogVariants({ footerPush: push }).footer({ className })} data-slot="dialog-footer" {...rest} />;
}

export interface DialogHeaderProps extends ComponentProps<"header"> {
  /** The header stays in view while the body scrolls under it. */
  sticky?: boolean;
  /** A title and actions that run out of room take a second line. */
  wrap?: boolean;
}

/** Keeps the modal heading separate from the scrolling body. */
export function DialogHeader({ className, sticky, wrap, ...rest }: DialogHeaderProps): ReactElement {
  return <header className={dialogVariants({ stickyHeader: sticky, headerWrap: wrap }).header({ className })} data-slot="dialog-header" {...rest} />;
}
