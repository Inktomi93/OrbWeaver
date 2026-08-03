import type {
  TooltipArrowProps as BaseArrowProps,
  TooltipPopupProps as BasePopupProps,
  TooltipPositionerProps as BasePositionerProps,
  TooltipProviderProps as BaseProviderProps,
  TooltipRootProps as BaseRootProps,
  TooltipTriggerProps as BaseTriggerProps,
} from "@base-ui/react/tooltip";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";
import { createContext, use, useId } from "react";
import type { PortalContainer } from "#lib";
import { ANCHOR_GAP_TRIGGER, usePortalContainer } from "#lib";
import { tooltipVariants } from "./variants.ts";

const slots = tooltipVariants();

// Base UI Positioner offsets are px numbers, not classes.
const DEFAULT_SIDE_OFFSET = ANCHOR_GAP_TRIGGER;

// Base UI's Tooltip doesn't wire the WCAG name/description relationship itself, so this seal mints
// ONE id per `<Tooltip>` and threads it: popup gets `id` + `role="tooltip"`, trigger gets `aria-describedby`.
const TooltipDescriptionContext = createContext<string | undefined>(undefined);

/** Shares hover delay/timeout across a subtree so adjacent tooltips open instantly. */
export function TooltipProvider(props: BaseProviderProps): ReactElement {
  // @orb-gate-ignore no-context-provider: Base UI's Tooltip.Provider is a namespace COMPONENT, not a React Context — the React-19 `<Context.Provider>` deprecation the gate targets doesn't apply.
  return <BaseTooltip.Provider {...props} />;
}

export function Tooltip<Payload = unknown>(props: BaseRootProps<Payload>): ReactElement {
  const descriptionId = useId();
  return (
    <TooltipDescriptionContext value={descriptionId}>
      <BaseTooltip.Root {...props} />
    </TooltipDescriptionContext>
  );
}

/** Accepts `handle` + `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven tooltip. */
export function TooltipTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  const descriptionId = use(TooltipDescriptionContext);
  return <BaseTooltip.Trigger aria-describedby={descriptionId} {...props} />;
}

export interface TooltipPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  side?: BasePositionerProps["side"];
  align?: BasePositionerProps["align"];
  sideOffset?: BasePositionerProps["sideOffset"];
  /** Defaults to the themed portal root; pass an explicit node/ref to override. */
  container?: PortalContainer;
}

/** Bundles Portal → Positioner → Popup. */
export function TooltipPopup(props: TooltipPopupProps): ReactElement {
  const { className, children, side, align, sideOffset = DEFAULT_SIDE_OFFSET, container, ...rest } = props;
  const portalContainer = usePortalContainer();
  const descriptionId = use(TooltipDescriptionContext);
  return (
    <BaseTooltip.Portal container={container ?? portalContainer}>
      <BaseTooltip.Positioner align={align} className={slots.positioner()} data-slot="tooltip-positioner" side={side} sideOffset={sideOffset}>
        <BaseTooltip.Popup id={descriptionId} role="tooltip" className={slots.popup({ className })} data-slot="tooltip-popup" {...rest}>
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}

export interface TooltipArrowProps extends Omit<BaseArrowProps, "className"> {
  className?: string;
}

export function TooltipArrow(props: TooltipArrowProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseTooltip.Arrow className={slots.arrow({ className })} data-slot="tooltip-arrow" {...rest} />;
}
