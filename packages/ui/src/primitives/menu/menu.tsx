import type {
  MenuArrowProps as BaseArrowProps,
  MenuBackdropProps as BaseBackdropProps,
  MenuCheckboxItemProps as BaseCheckboxItemProps,
  MenuGroupLabelProps as BaseGroupLabelProps,
  MenuGroupProps as BaseGroupProps,
  MenuItemProps as BaseItemProps,
  MenuLinkItemProps as BaseLinkItemProps,
  MenuPopupProps as BasePopupProps,
  MenuPositionerProps as BasePositionerProps,
  MenuRadioGroupProps as BaseRadioGroupProps,
  MenuRadioItemProps as BaseRadioItemProps,
  MenuRootProps as BaseRootProps,
  MenuSubmenuRootProps as BaseSubmenuRootProps,
  MenuSubmenuTriggerProps as BaseSubmenuTriggerProps,
  MenuTriggerProps as BaseTriggerProps,
  MenuViewportProps as BaseViewportProps,
} from "@base-ui/react/menu";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ComponentProps, ReactElement } from "react";
import type { PortalContainer } from "#lib";
import { ANCHOR_GAP_TRIGGER, usePortalContainer } from "#lib";
import { Check, ChevronRight, Icon } from "#primitives/icons";
import { menuVariants } from "./variants.ts";

const slots = menuVariants();

// = --spacing-row (0.5rem); Base UI Positioner offsets are px numbers, not classes.
const DEFAULT_SIDE_OFFSET = ANCHOR_GAP_TRIGGER;

/**
 * Menu root — seals Base UI Menu (roving highlight, typeahead, dismiss come free). State-only.
 * Generic over `Payload` like the popover/tooltip seals: a handle-driven menu reads the active
 * trigger's payload through the render-function `children`, and a non-generic wrap would type that
 * payload `unknown` at every call site.
 */
export function Menu<Payload = unknown>(props: BaseRootProps<Payload>): ReactElement {
  return <BaseMenu.Root {...props} />;
}

/** Opens the menu. Unstyled passthrough — compose your own control via `render`. Accepts `handle` +
 *  `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven menu. */
export function MenuTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  return <BaseMenu.Trigger {...props} />;
}

export interface MenuPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  /** Placement side, forwarded to the explicit Positioner. @defaultValue "bottom" */
  side?: BasePositionerProps["side"];
  /** Alignment on the side. @defaultValue "start" */
  align?: BasePositionerProps["align"];
  /** Anchor gap in px. @defaultValue 8 (= --spacing-row) */
  sideOffset?: BasePositionerProps["sideOffset"];
  /** Portal target — defaults to the themed portal root; pass a node/ref to override. */
  container?: PortalContainer;
}

/** The menu surface — bundles Portal → Positioner → Popup so the anatomy can't be mis-assembled. */
export function MenuPopup(props: MenuPopupProps): ReactElement {
  const { className, children, side, align = "start", sideOffset = DEFAULT_SIDE_OFFSET, container, ...rest } = props;
  const portalContainer = usePortalContainer();
  return (
    <BaseMenu.Portal container={container ?? portalContainer}>
      <BaseMenu.Positioner align={align} className={slots.positioner()} data-slot="menu-positioner" side={side} sideOffset={sideOffset}>
        <BaseMenu.Popup className={slots.popup({ className })} data-slot="menu-popup" {...rest}>
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export interface MenuViewportProps extends Omit<BaseViewportProps, "className"> {
  className?: string;
}

/**
 * OPTIONAL transition container — render it INSIDE `<MenuPopup>`, wrapping the items, when ONE menu
 * is opened by several triggers and its contents change per trigger. It keeps the outgoing items
 * mounted through the swap so the change animates instead of snapping, and publishes
 * `data-activation-direction`/`data-transitioning` for that animation. A single-trigger menu needs
 * nothing here.
 */
export function MenuViewport(props: MenuViewportProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.Viewport className={className} data-slot="menu-viewport" {...rest} />;
}

export interface MenuArrowProps extends Omit<BaseArrowProps, "className"> {
  className?: string;
}

/** An arrow that points at the anchor — place inside `<MenuPopup>`. */
export function MenuArrow(props: MenuArrowProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.Arrow className={slots.arrow({ className })} data-slot="menu-arrow" {...rest} />;
}

export interface MenuItemProps extends Omit<BaseItemProps, "className"> {
  className?: string;
}

/** A selectable menu command (closes the menu on click by default). */
export function MenuItem(props: MenuItemProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.Item className={slots.item({ className })} data-slot="menu-item" {...rest} />;
}

export interface MenuSeparatorProps extends Omit<ComponentProps<typeof BaseMenu.Separator>, "className"> {
  className?: string;
}

/** Visual divider between menu groups. */
export function MenuSeparator(props: MenuSeparatorProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.Separator className={slots.separator({ className })} {...rest} />;
}

export interface MenuGroupProps extends Omit<BaseGroupProps, "className"> {
  className?: string;
}

/** Groups related items under one MenuGroupLabel — Base UI wires the label↔group aria association. */
export function MenuGroup(props: MenuGroupProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.Group className={slots.group({ className })} data-slot="menu-group" {...rest} />;
}

export interface MenuGroupLabelProps extends Omit<BaseGroupLabelProps, "className"> {
  className?: string;
}

/** The heading for a MenuGroup — a muted section caption, auto-associated with its parent group. */
export function MenuGroupLabel(props: MenuGroupLabelProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.GroupLabel className={slots.groupLabel({ className })} data-slot="menu-group-label" {...rest} />;
}

export interface MenuCheckboxItemProps extends Omit<BaseCheckboxItemProps, "className"> {
  className?: string;
}

/**
 * A toggle row (view/display toggles like "Show minimap"). Bakes Base UI's native
 * `CheckboxItemIndicator`. Default `closeOnClick` is `true`; pass `false` for a settings menu you
 * keep open while flipping several toggles.
 */
export function MenuCheckboxItem(props: MenuCheckboxItemProps): ReactElement {
  const { className, children, ...rest } = props;
  return (
    <BaseMenu.CheckboxItem className={slots.checkboxItem({ className })} data-slot="menu-checkbox-item" {...rest}>
      <BaseMenu.CheckboxItemIndicator className={slots.itemIndicator()}>
        <Icon icon={Check} size="sm" />
      </BaseMenu.CheckboxItemIndicator>
      {children}
    </BaseMenu.CheckboxItem>
  );
}

/** Groups radio items into one single-select set (sort-by, view-mode pickers). */
export function MenuRadioGroup(props: BaseRadioGroupProps): ReactElement {
  return <BaseMenu.RadioGroup {...props} />;
}

export interface MenuRadioItemProps extends Omit<BaseRadioItemProps, "className"> {
  className?: string;
}

/**
 * One option in a MenuRadioGroup — selecting it deselects its siblings. Default `closeOnClick` is
 * `false` (the menu stays open so the user can re-pick).
 */
export function MenuRadioItem(props: MenuRadioItemProps): ReactElement {
  const { className, children, ...rest } = props;
  return (
    <BaseMenu.RadioItem className={slots.radioItem({ className })} data-slot="menu-radio-item" {...rest}>
      <BaseMenu.RadioItemIndicator className={slots.itemIndicator()}>
        <Icon icon={Check} size="sm" />
      </BaseMenu.RadioItemIndicator>
      {children}
    </BaseMenu.RadioItem>
  );
}

/** Groups all parts of a nested submenu — wraps a trigger and the submenu's own MenuPopup. */
export function MenuSubmenuRoot(props: BaseSubmenuRootProps): ReactElement {
  return <BaseMenu.SubmenuRoot {...props} />;
}

export interface MenuSubmenuTriggerProps extends Omit<BaseSubmenuTriggerProps, "className"> {
  className?: string;
}

/** The row that opens a nested submenu, with a trailing chevron. Opens on hover and ArrowRight.
 *
 *  THE CHEVRON DOES NOT FLIP WHEN THE SUBMENU OPENS LEFT, and cannot today (side-eye 2026-08-08 P3, verified
 *  against the installed Base UI). Which side the child lands on is the POSITIONER's fact — it publishes
 *  `data-side` — and the positioner is PORTALED out of the trigger's subtree, so no CSS relationship
 *  (`:has`, sibling, ancestor) reaches it. The trigger's own contract exposes three attributes and side is
 *  not among them (`menu/submenu-trigger/MenuSubmenuTriggerDataAttributes.d.ts`: `data-popup-open`,
 *  `data-highlighted`, `data-disabled`), and `@base-ui/react/menu` exports no positioner-context hook —
 *  every part is a type-only export beside the components (`menu/index.d.ts`). Closing this needs NEW
 *  plumbing (a seal-owned context published by `MenuPopup` and read here), which a P3 does not buy. Left
 *  static and stated, rather than plumbed or silently wrong. */
export function MenuSubmenuTrigger(props: MenuSubmenuTriggerProps): ReactElement {
  const { className, children, ...rest } = props;
  return (
    <BaseMenu.SubmenuTrigger className={slots.submenuTrigger({ className })} data-slot="menu-submenu-trigger" {...rest}>
      {children}
      {/* The chevron rides its own BOX, not a bare `<svg>`: `item`'s leading-gutter rule withdraws the
          gutter from a row whose first ELEMENT child is an svg, and a text-only trigger's first element
          child would otherwise be this trailing chevron — suppressing exactly the gutter it needs. */}
      <span className={slots.submenuChevron()} data-slot="menu-submenu-chevron">
        <Icon icon={ChevronRight} size="sm" />
      </span>
    </BaseMenu.SubmenuTrigger>
  );
}

export interface MenuLinkItemProps extends Omit<BaseLinkItemProps, "className"> {
  className?: string;
}

/** A navigating menu item — renders an `<a>` with `href`. Default `closeOnClick` is `false`. */
export function MenuLinkItem(props: MenuLinkItemProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.LinkItem className={slots.linkItem({ className })} data-slot="menu-link-item" {...rest} />;
}

export interface MenuBackdropProps extends Omit<BaseBackdropProps, "className"> {
  className?: string;
}

/** An optional dimming overlay for a modal menu; render as a direct child of `<Menu>`. */
export function MenuBackdrop(props: MenuBackdropProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.Backdrop className={slots.backdrop({ className })} data-slot="menu-backdrop" {...rest} />;
}
