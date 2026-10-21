import type {
  PopoverArrowProps as BaseArrowProps,
  PopoverCloseProps as BaseCloseProps,
  PopoverDescriptionProps as BaseDescriptionProps,
  PopoverPopupProps as BasePopupProps,
  PopoverPositionerProps as BasePositionerProps,
  PopoverRootProps as BaseRootProps,
  PopoverTitleProps as BaseTitleProps,
  PopoverTriggerProps as BaseTriggerProps,
  PopoverViewportProps as BaseViewportProps,
} from "@base-ui/react/popover";
import { Popover as BasePopover } from "@base-ui/react/popover";
import type { CSSProperties, ReactElement } from "react";
import type { PortalContainer } from "#lib";
import { ANCHOR_GAP_TRIGGER, usePortalContainer } from "#lib";
import { popoverVariants } from "./variants.ts";

const slots = popoverVariants();

// Base UI Positioner offsets are px numbers, not classes.
const DEFAULT_SIDE_OFFSET = ANCHOR_GAP_TRIGGER;

// `width="stable"` (#663): a plain `min-w-cq-sm` at the call site OVERFLOWED a docked pane — Base UI's
// Positioner publishes `--available-width` (the same var the `max-w-cq-sm` cap on the OTHER slot half
// already reads), and a fixed 24rem min-width ignores it, so the popup rendered 384px inside 376.09px of
// real room. `min()` is the honest intersection (the same reasoning `select.tsx`'s `POPUP_STYLE` already
// uses on this exact Base UI Positioner shape) — `width`, not `max-width`, because the DEFAULT behavior
// (shrink-wrap to content, capped at `max-w-cq-sm`) is right for most popovers, but a body that SWAPS in
// place across steps (a catalogue → a knob form) needs a FIXED frame or the swap reads as a resize.
// Tailwind's bracket/paren syntax can't express two-var `min()` without tripping `no-arbitrary-tw-values`
// (its `TOKEN_DRIVEN_RE` only exempts a body starting `var(`/`calc(`/`--`, and `min(...)` doesn't) — an
// inline style is the one honest, gate-clean spelling, same as `select.tsx`.
const STABLE_WIDTH_STYLE: CSSProperties = { width: "min(var(--available-width), var(--container-cq-sm))" };

/**
 * WHICH POPOVERS TAKE `modal`, AND WHY — the one home for that call (#2444, side-eye 2026-09-19).
 *
 * A non-modal popover leaves the page HIT-LIVE underneath it. Measured at 430x740 with the bug-report form
 * open at `y=68..502`: `elementFromPoint` at `y=540..620` returned the live composer cluster and its
 * textarea, and a programmatic scroll of the transcript behind it succeeded — so on a phone a thumb
 * reaching past the sheet operates whatever happens to be behind it, and dismisses the form on the way.
 *
 * `modal` is the fence: Base UI renders its own fixed `role="presentation"` backdrop over the page
 * (`utils/InternalBackdrop.js`, gated on `modal === true` and a non-hover open reason), which absorbs the
 * outside press instead of letting it through. It needs no `backdrop` prop — that one renders the visible
 * SCRIM, which is a separate look decision, not the containment.
 *
 * THE RULE: a popover whose body carries an INPUT the user can lose or mis-target — a text entry, a
 * radio/slider/knob form, a click-to-edit field — takes `modal`. A read-only PEEK (`chat-recall-indicator`,
 * `compact-summary-peek`) and a one-tap COMMIT list (the notifications inbox, the face-strip overflow, the
 * rpg icon picker) are correct unfenced and stay that way: nothing is in flight to protect, and a fence
 * would cost a second tap to leave.
 */
export function Popover<Payload = unknown>(props: BaseRootProps<Payload>): ReactElement {
  return <BasePopover.Root {...props} />;
}

/** Accepts `handle` + `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven popover. */
export function PopoverTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  return <BasePopover.Trigger {...props} />;
}

export interface PopoverPopupProps extends Omit<BasePopupProps, "className" | "style"> {
  className?: string;
  /** Base UI's `style` also accepts a per-state render function; this seal only ever needs a plain object. */
  style?: CSSProperties;
  side?: BasePositionerProps["side"];
  align?: BasePositionerProps["align"];
  sideOffset?: BasePositionerProps["sideOffset"];
  alignOffset?: BasePositionerProps["alignOffset"];
  /** Defaults to the themed portal root so the popup inherits the active `<ThemeScope>` instead of `<body>`. */
  container?: PortalContainer;
  /** Dismissable backdrop behind the popup; pair with `<Popover modal>` for focus/scroll containment. */
  backdrop?: boolean;
  /**
   * `"stable"` pins the popup to `min(24rem, --available-width)` instead of the default shrink-wrap-to-
   * -content (capped at `max-w-cq-sm`). Opt in only when the body SWAPS in place across steps and a
   * content-driven width would make the swap read as a resize/teleport rather than content changing
   * inside a fixed frame — most popovers (menus, single-line pickers) want the default. See
   * `STABLE_WIDTH_STYLE` above for the receipt that forced this.
   */
  width?: "stable";
}

/** Bundles Portal → (optional Backdrop) → Positioner → Popup so the anatomy cannot be mis-assembled. */
export function PopoverPopup(props: PopoverPopupProps): ReactElement {
  const { className, children, side, align, sideOffset = DEFAULT_SIDE_OFFSET, alignOffset, container, backdrop = false, width, style, ...rest } = props;
  const portalContainer = usePortalContainer();
  const popupStyle: CSSProperties | undefined = width === "stable" ? { ...style, ...STABLE_WIDTH_STYLE } : style;
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
        <BasePopover.Popup className={slots.popup({ className })} data-slot="popover-popup" style={popupStyle} {...rest}>
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export interface PopoverViewportProps extends Omit<BaseViewportProps, "className"> {
  className?: string;
}

/**
 * OPTIONAL transition container — render it INSIDE `<PopoverPopup>`, wrapping the body, when ONE
 * popover is opened by several triggers and the body changes per trigger (the `createPopoverHandle`
 * shape). It keeps the outgoing content mounted during the swap so the change animates instead of
 * snapping, and publishes `data-activation-direction`/`data-transitioning` to drive that animation.
 * A single-trigger popover needs nothing here — its children are already the popup body.
 */
export function PopoverViewport(props: PopoverViewportProps): ReactElement {
  const { className, ...rest } = props;
  return <BasePopover.Viewport className={className} data-slot="popover-viewport" {...rest} />;
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
