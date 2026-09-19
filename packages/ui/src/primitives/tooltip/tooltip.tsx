import type {
  TooltipArrowProps as BaseArrowProps,
  TooltipPopupProps as BasePopupProps,
  TooltipPositionerProps as BasePositionerProps,
  TooltipProviderProps as BaseProviderProps,
  TooltipRootProps as BaseRootProps,
  TooltipTriggerProps as BaseTriggerProps,
  TooltipViewportProps as BaseViewportProps,
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
// ONE id per `<Tooltip>` and threads it: the trigger gets `aria-describedby`, and the id names the
// ALWAYS-MOUNTED `sr-only` description node `TooltipPopup` renders beside its portal.
//
// WHY THE DESCRIPTION IS A SEPARATE NODE AND NOT THE POPUP (#2455). The id used to land on the popup,
// which Base UI mounts only while the tooltip is OPEN — so at rest every trigger in the app carried a
// DANGLING `aria-describedby` (measured 2026-09-19 on settings:appearance.sizing: 33/33 hint triggers
// resolved 0 ids at rest, the hovered one resolved 1) and a virtual screen-reader cursor read the
// control's name and nothing else. #2443 had already patched the symptom at ONE call site (HintTrigger
// minted its own second sr-only id); this is the same remedy moved to the seal, where it covers all 92.
//
// THE ARM: an always-mounted description, not "emit describedby only while open". A description that
// exists only during a hover is unreachable to the users who need it most — a screen-reader user never
// produces the hover or the `:focus-visible` Base UI gates the tooltip on (`mouseOnly: true`, and
// useFocus's `:focus-visible` early return — see hint-trigger.tsx's header). The rendered popup keeps
// its animation and its geometry and becomes a purely VISUAL duplicate: `aria-hidden`, no id, no role,
// so the text appears exactly ONCE in the accessibility tree whether the tooltip is open or closed.
const TooltipDescriptionContext = createContext<string | undefined>(undefined);

// TRUE inside the sr-only description copy, FALSE inside the portal. The description renders the popup's
// OWN children so an arbitrary node keeps working in both copies — but Base UI's structural tooltip parts
// (Arrow, Viewport) read a positioner/popup context that only exists inside the portal and THROW without
// it, which took the whole mount down. The seal's own wrappers therefore degrade here: the arrow is pure
// decoration and renders nothing, the viewport is a transition container and renders its children bare.
const TooltipDescriptionCopyContext = createContext(false);

/** Shares hover delay/timeout across a subtree so adjacent tooltips open instantly. */
export function TooltipProvider(props: BaseProviderProps): ReactElement {
  return <BaseTooltip.Provider {...props} />;
}

export interface TooltipProps<Payload = unknown> extends BaseRootProps<Payload> {
  /** FALSE when this tooltip must NOT become the trigger's accessible description — either the caller
   *  already owns one (it passes its own `aria-describedby`), or the tooltip text only repeats the
   *  trigger's accessible name and describing with it would announce that name twice. Opting out is a
   *  DECLARATION, never a guess: the seal cannot compute either fact, and the call site knows both
   *  (`composer-guided-buttons.tsx`'s `resolveGuidedDetail` is the worked example).
   *  @defaultValue true */
  readonly describesTrigger?: boolean;
}

export function Tooltip<Payload = unknown>({ describesTrigger = true, ...props }: TooltipProps<Payload>): ReactElement {
  const descriptionId = useId();
  return (
    <TooltipDescriptionContext value={describesTrigger ? descriptionId : undefined}>
      <BaseTooltip.Root {...props} />
    </TooltipDescriptionContext>
  );
}

/** Accepts `handle` + `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven tooltip. */
export function TooltipTrigger<Payload = unknown>({ "aria-describedby": callerDescribedBy, ...props }: BaseTriggerProps<Payload>): ReactElement {
  const descriptionId = use(TooltipDescriptionContext);
  // MERGED, never overwritten — and the merge is why this one is DESTRUCTURED out of the spread rather
  // than ordered around it (`ui-accname-survives-spread`'s second arm). `aria-describedby` is a
  // SPACE-SEPARATED id list, and this seal's id is the only thing pointing at the popup: with the seal's
  // attribute before the spread a caller's own description (a field hint, an error line) REPLACED it and
  // the popup rendered under an id nothing referenced; after it, the caller's would be the one dropped.
  // Neither is right for a list. The seal's id leads (the tooltip is this component's own contract), the
  // caller's follows.
  const describedBy = callerDescribedBy === undefined ? descriptionId : `${descriptionId ?? ""} ${callerDescribedBy}`.trim();
  return <BaseTooltip.Trigger aria-describedby={describedBy} {...props} />;
}

export interface TooltipPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  side?: BasePositionerProps["side"];
  align?: BasePositionerProps["align"];
  sideOffset?: BasePositionerProps["sideOffset"];
  /** Defaults to the themed portal root; pass an explicit node/ref to override. */
  container?: PortalContainer;
}

/** Bundles the at-rest `role="tooltip"` description node + Portal → Positioner → Popup. */
export function TooltipPopup(props: TooltipPopupProps): ReactElement {
  const { className, children, side, align, sideOffset = DEFAULT_SIDE_OFFSET, container, ...rest } = props;
  const portalContainer = usePortalContainer();
  const descriptionId = use(TooltipDescriptionContext);
  return (
    <>
      {/* THE ACCESSIBLE TOOLTIP. It is this node, not the portal below, that the trigger's
          `aria-describedby` names — and it is mounted whether or not the tooltip is open. Absent under
          `describesTrigger={false}`, where an unreferenced copy would only be noise in the tree. */}
      {descriptionId === undefined ? null : (
        <span className={slots.description()} data-slot="tooltip-description" id={descriptionId} role="tooltip">
          <TooltipDescriptionCopyContext value={true}>{children}</TooltipDescriptionCopyContext>
        </span>
      )}
      <BaseTooltip.Portal container={container ?? portalContainer}>
        <BaseTooltip.Positioner align={align} className={slots.positioner()} data-slot="tooltip-positioner" side={side} sideOffset={sideOffset}>
          {/* `aria-hidden`: the same sentence is already in the tree above, and announcing it twice while
              the pointer rests on a control is worse than not painting it at all. */}
          <BaseTooltip.Popup aria-hidden={true} className={slots.popup({ className })} data-slot="tooltip-popup" {...rest}>
            {children}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </>
  );
}

export interface TooltipViewportProps extends Omit<BaseViewportProps, "className"> {
  className?: string;
}

/**
 * OPTIONAL transition container — render it INSIDE `<TooltipPopup>` when ONE tooltip serves several
 * triggers (the `createTooltipHandle` shape) and the text changes as the pointer moves between them.
 * Without it the label swaps instantly mid-flight; with it the swap animates and publishes
 * `data-activation-direction`/`data-transitioning`. A per-trigger tooltip needs nothing here.
 */
export function TooltipViewport(props: TooltipViewportProps): ReactElement {
  const { className, children, ...rest } = props;
  if (use(TooltipDescriptionCopyContext)) {
    return <>{children}</>;
  }
  return (
    <BaseTooltip.Viewport className={className} data-slot="tooltip-viewport" {...rest}>
      {children}
    </BaseTooltip.Viewport>
  );
}

export interface TooltipArrowProps extends Omit<BaseArrowProps, "className"> {
  className?: string;
}

export function TooltipArrow(props: TooltipArrowProps): ReactElement | null {
  const { className, ...rest } = props;
  if (use(TooltipDescriptionCopyContext)) {
    // Pure decoration — the description copy is text, and an arrow glyph in it would be announced.
    return null;
  }
  return <BaseTooltip.Arrow className={slots.arrow({ className })} data-slot="tooltip-arrow" {...rest} />;
}
