import type {
  PopoverArrowProps as BaseArrowProps,
  PopoverCloseProps as BaseCloseProps,
  PopoverDescriptionProps as BaseDescriptionProps,
  PopoverPopupProps as BasePopupProps,
  PopoverPositionerProps as BasePositionerProps,
  PopoverRootProps as BaseRootProps,
  PopoverTitleProps as BaseTitleProps,
  PopoverTriggerProps as BaseTriggerProps,
} from "@base-ui/react/popover";
import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement } from "react";
import type { PortalContainer } from "#lib";
import { ANCHOR_GAP_TRIGGER, usePortalContainer } from "#lib";
import { popoverVariants } from "./variants";

const slots = popoverVariants();

// Base UI Positioner offsets are px numbers, not classes.
const DEFAULT_SIDE_OFFSET = ANCHOR_GAP_TRIGGER;

export function Popover<Payload = unknown>(props: BaseRootProps<Payload>): ReactElement {
  return <BasePopover.Root {...props} />;
}

/** Accepts `handle` + `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven popover. */
export function PopoverTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  return <BasePopover.Trigger {...props} />;
}

export interface PopoverPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  side?: BasePositionerProps["side"];
  align?: BasePositionerProps["align"];
  sideOffset?: BasePositionerProps["sideOffset"];
  alignOffset?: BasePositionerProps["alignOffset"];
  /** Defaults to the themed portal root so the popup inherits the active `<ThemeScope>` instead of `<body>`. */
  container?: PortalContainer;
  /** Dismissable backdrop behind the popup; pair with `<Popover modal>` for focus/scroll containment. */
  backdrop?: boolean;
}

/** Bundles Portal → (optional Backdrop) → Positioner → Popup so the anatomy cannot be mis-assembled. */
export function PopoverPopup(props: PopoverPopupProps): ReactElement {
  const { className, children, side, align, sideOffset = DEFAULT_SIDE_OFFSET, alignOffset, container, backdrop = false, ...rest } = props;
  const portalContainer = usePortalContainer();
  return (
    <BasePopover.Portal container={container ?? portalContainer}>
      {backdrop ? <BasePopover.Backdrop className={slots.backdrop()} data-slot="popover-backdrop" /> : null}
      <BasePopover.Positioner
        align={align}
        alignOffset={alignOffset}
        className={slots.positioner()}
        data-slot="popover-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <BasePopover.Popup className={slots.popup({ className })} data-slot="popover-popup" {...rest}>
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export interface PopoverArrowProps extends Omit<BaseArrowProps, "className"> {
  className?: string;
}

export function PopoverArrow(props: PopoverArrowProps): ReactElement {
  const { className, ...rest } = props;
  return <BasePopover.Arrow className={slots.arrow({ className })} data-slot="popover-arrow" {...rest} />;
}

export function PopoverClose(props: BaseCloseProps): ReactElement {
  return <BasePopover.Close {...props} />;
}

export interface PopoverTitleProps extends Omit<BaseTitleProps, "className"> {
  className?: string;
}

export function PopoverTitle(props: PopoverTitleProps): ReactElement {
  const { className, ...rest } = props;
  return <BasePopover.Title className={slots.title({ className })} {...rest} />;
}

export interface PopoverDescriptionProps extends Omit<BaseDescriptionProps, "className"> {
  className?: string;
}

export function PopoverDescription(props: PopoverDescriptionProps): ReactElement {
  const { className, ...rest } = props;
  return <BasePopover.Description className={slots.description({ className })} {...rest} />;
}
