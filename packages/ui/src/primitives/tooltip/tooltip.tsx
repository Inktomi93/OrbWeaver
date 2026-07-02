import type {
  TooltipPopupProps as BasePopupProps,
  TooltipPositionerProps as BasePositionerProps,
  TooltipProviderProps as BaseProviderProps,
  TooltipRootProps as BaseRootProps,
  TooltipTriggerProps as BaseTriggerProps,
} from "@base-ui/react/tooltip";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";
import { tooltipVariants } from "./variants";

const slots = tooltipVariants();

// = --spacing-row (0.5rem) — Base UI Positioner offsets are px numbers, not classes.
const DEFAULT_SIDE_OFFSET = 8;

/**
 * Shares hover delay/timeout across a subtree so adjacent tooltips open instantly.
 * `<TooltipProvider><App /></TooltipProvider>`
 * Spec: ui-package-design §6.1; live Base UI Tooltip docs (Provider delay/closeDelay/timeout).
 */
export function TooltipProvider(props: BaseProviderProps): ReactElement {
  return <BaseTooltip.Provider {...props} />;
}

/**
 * Tooltip root — seals Base UI Tooltip (hover/focus open and touch suppression come free;
 * tooltips are disabled on touch devices per the live docs). State-only.
 * `<Tooltip><TooltipTrigger>?</TooltipTrigger><TooltipPopup>Help</TooltipPopup></Tooltip>`
 * Spec: ui-package-design §6.1 / UI-Arch §4b (tooltip-on-touch correctness is Base UI's).
 */
export function Tooltip<Payload = unknown>(props: BaseRootProps<Payload>): ReactElement {
  return <BaseTooltip.Root {...props} />;
}

/**
 * The hoverable/focusable anchor. Unstyled passthrough — compose your own control via `render`.
 * Accepts `handle` + `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven tooltip.
 * `<TooltipTrigger render={<Button size="icon" aria-label="Help">?</Button>} />`
 * Spec: ui-package-design §6.1 / §13 R2.
 */
export function TooltipTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  return <BaseTooltip.Trigger {...props} />;
}

export interface TooltipPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  /** Placement side, forwarded to the explicit Positioner. @default "top" (Base UI default) */
  side?: BasePositionerProps["side"];
  align?: BasePositionerProps["align"];
  /** Anchor gap in px. @default 8 (= --spacing-row) */
  sideOffset?: BasePositionerProps["sideOffset"];
}

/**
 * The tooltip surface — bundles Portal → Positioner (`--z-tooltip`, token-safe sideOffset default)
 * → Popup.
 * `<TooltipPopup>Regenerate reply</TooltipPopup>`
 * Spec: ui-package-design §6.1 dictate — explicit Positioner with a token-safe sideOffset default.
 */
export function TooltipPopup(props: TooltipPopupProps): ReactElement {
  const { className, children, side, align, sideOffset = DEFAULT_SIDE_OFFSET, ...rest } = props;
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner
        align={align}
        className={slots.positioner()}
        data-slot="tooltip-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <BaseTooltip.Popup
          className={slots.popup({ className })}
          data-slot="tooltip-popup"
          {...rest}
        >
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}
