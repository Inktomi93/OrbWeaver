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
import { usePortalContainer } from "#lib";
import { popoverVariants } from "./variants";

const slots = popoverVariants();

// = --spacing-row (0.5rem) — Base UI Positioner offsets are px numbers, not classes.
const DEFAULT_SIDE_OFFSET = 8;

/**
 * Popover root — seals Base UI Popover (dismiss on outside press/Esc comes free). State-only.
 * `<Popover><PopoverTrigger>Info</PopoverTrigger><PopoverPopup>…</PopoverPopup></Popover>`
 * Spec: ui-package-design §6.1 / UI-Arch §2 (explicit Positioner kills the portal weirdness).
 */
export function Popover<Payload = unknown>(props: BaseRootProps<Payload>): ReactElement {
  return <BasePopover.Root {...props} />;
}

/**
 * Opens the popover. Unstyled passthrough — compose your own control via `render`.
 * Accepts `handle` + `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven popover.
 * `<PopoverTrigger render={<Button variant="ghost">Details</Button>} />`
 * Spec: ui-package-design §6.1 / §13 R2.
 */
export function PopoverTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  return <BasePopover.Trigger {...props} />;
}

export interface PopoverPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  /** Placement side, forwarded to the explicit Positioner. @defaultValue "bottom" */
  side?: BasePositionerProps["side"];
  /** Alignment on the side, forwarded to the Positioner. @defaultValue "center" */
  align?: BasePositionerProps["align"];
  /** Anchor gap in px. @defaultValue 8 (= --spacing-row) */
  sideOffset?: BasePositionerProps["sideOffset"];
  alignOffset?: BasePositionerProps["alignOffset"];
  /**
   * Portal target — defaults to the themed portal root from {@link usePortalContainer} (so the popup
   * inherits the active `<ThemeScope>` instead of `<body>`'s Hearth defaults, D44 §12.1); pass an
   * explicit node/ref to override; unset keeps Base UI's `body` default.
   */
  container?: PortalContainer;
  /**
   * Render a dismissable `bg-scrim` backdrop behind the popup (for a modal-style popover). The
   * backdrop lives inside the bundled Portal, before the Positioner (Base UI's required placement).
   * Pair with `<Popover modal>` for focus/scroll containment. @defaultValue false
   */
  backdrop?: boolean;
}

/**
 * The popover surface — bundles Portal → (optional Backdrop) → Positioner (`--z-overlay`, token-safe
 * sideOffset default) → Popup so the anatomy cannot be mis-assembled. Place `<PopoverArrow>` and
 * `<PopoverClose>` inside as children.
 * `<PopoverPopup side="top" backdrop><PopoverTitle>Filters</PopoverTitle>…</PopoverPopup>`
 * Spec: ui-package-design §6.1 / §13 R2 — explicit Positioner + Backdrop/Arrow/Close surface.
 */
export function PopoverPopup(props: PopoverPopupProps): ReactElement {
  const {
    className,
    children,
    side,
    align,
    sideOffset = DEFAULT_SIDE_OFFSET,
    alignOffset,
    container,
    backdrop = false,
    ...rest
  } = props;
  const portalContainer = usePortalContainer();
  return (
    <BasePopover.Portal container={container ?? portalContainer}>
      {backdrop ? (
        <BasePopover.Backdrop className={slots.backdrop()} data-slot="popover-backdrop" />
      ) : null}
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

export interface PopoverArrowProps extends Omit<BaseArrowProps, "className"> {
  className?: string;
}

/**
 * An arrow that points at the anchor — place inside `<PopoverPopup>`. Base UI positions it and sets
 * `data-side`/`data-align`; we skin it as a `bg-popover` diamond that continues the popup edge.
 * `<PopoverPopup><PopoverArrow /><PopoverTitle>…</PopoverTitle></PopoverPopup>`
 * Spec: ui-package-design §13 R2 (full native part surface).
 */
export function PopoverArrow(props: PopoverArrowProps): ReactElement {
  const { className, ...rest } = props;
  return (
    <BasePopover.Arrow className={slots.arrow({ className })} data-slot="popover-arrow" {...rest} />
  );
}

/**
 * Closes the popover — place inside `<PopoverPopup>`. Required for focus trapping in `<Popover modal>`
 * (touch screen readers escape through it). Unstyled passthrough — compose via `render`.
 * `<PopoverClose render={<Button variant="ghost">Done</Button>} />`
 * Spec: ui-package-design §6.1 / §13 R2.
 */
export function PopoverClose(props: BaseCloseProps): ReactElement {
  return <BasePopover.Close {...props} />;
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
