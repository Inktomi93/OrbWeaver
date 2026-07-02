import type {
  PopoverDescriptionProps as BaseDescriptionProps,
  PopoverPopupProps as BasePopupProps,
  PopoverPositionerProps as BasePositionerProps,
  PopoverRootProps as BaseRootProps,
  PopoverTitleProps as BaseTitleProps,
  PopoverTriggerProps as BaseTriggerProps,
} from "@base-ui/react/popover";
import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement } from "react";
import { popoverVariants } from "./variants";

const slots = popoverVariants();

// = --spacing-row (0.5rem) — Base UI Positioner offsets are px numbers, not classes.
const DEFAULT_SIDE_OFFSET = 8;

/**
 * Popover root — seals Base UI Popover (dismiss on outside press/Esc comes free). State-only.
 * `<Popover><PopoverTrigger>Info</PopoverTrigger><PopoverPopup>…</PopoverPopup></Popover>`
 * Spec: ui-package-design §6.1 / UI-Arch §2 (explicit Positioner kills the portal weirdness).
 */
export function Popover(props: BaseRootProps): ReactElement {
  return <BasePopover.Root {...props} />;
}

/**
 * Opens the popover. Unstyled passthrough — compose your own control via `render`.
 * `<PopoverTrigger render={<Button variant="ghost">Details</Button>} />`
 * Spec: ui-package-design §6.1.
 */
export function PopoverTrigger(props: BaseTriggerProps): ReactElement {
  return <BasePopover.Trigger {...props} />;
}

export interface PopoverPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  /** Placement side, forwarded to the explicit Positioner. @default "bottom" */
  side?: BasePositionerProps["side"];
  /** Alignment on the side, forwarded to the Positioner. @default "center" */
  align?: BasePositionerProps["align"];
  /** Anchor gap in px. @default 8 (= --spacing-row) */
  sideOffset?: BasePositionerProps["sideOffset"];
  alignOffset?: BasePositionerProps["alignOffset"];
}

/**
 * The popover surface — bundles Portal → Positioner (`--z-overlay`, token-safe sideOffset default)
 * → Popup so the anatomy cannot be mis-assembled.
 * `<PopoverPopup side="top"><PopoverTitle>Filters</PopoverTitle>…</PopoverPopup>`
 * Spec: ui-package-design §6.1 dictate — explicit Positioner with a token-safe sideOffset default.
 */
export function PopoverPopup(props: PopoverPopupProps): ReactElement {
  const {
    className,
    children,
    side,
    align,
    sideOffset = DEFAULT_SIDE_OFFSET,
    alignOffset,
    ...rest
  } = props;
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        align={align}
        alignOffset={alignOffset}
        className={slots.positioner()}
        data-slot="popover-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <BasePopover.Popup
          className={slots.popup({ className })}
          data-slot="popover-popup"
          {...rest}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export interface PopoverTitleProps extends Omit<BaseTitleProps, "className"> {
  className?: string;
}

/**
 * Accessible popover heading.
 * `<PopoverTitle>Notifications</PopoverTitle>`
 * Spec: ui-package-design §6.1.
 */
export function PopoverTitle(props: PopoverTitleProps): ReactElement {
  const { className, ...rest } = props;
  return <BasePopover.Title className={slots.title({ className })} {...rest} />;
}

export interface PopoverDescriptionProps extends Omit<BaseDescriptionProps, "className"> {
  className?: string;
}

/**
 * Supporting copy under the popover title.
 * `<PopoverDescription>You're all caught up.</PopoverDescription>`
 * Spec: ui-package-design §6.1.
 */
export function PopoverDescription(props: PopoverDescriptionProps): ReactElement {
  const { className, ...rest } = props;
  return <BasePopover.Description className={slots.description({ className })} {...rest} />;
}
