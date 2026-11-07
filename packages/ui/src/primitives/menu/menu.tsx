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
import type { VariantProps } from "tailwind-variants";
import type { PortalContainer } from "#lib";
import { ANCHOR_GAP_TRIGGER, cn, HIDDEN_AT, resolveCssLength, usePortalContainer } from "#lib";
import { Check, ChevronRight, Icon } from "#primitives/icons";
import { menuItemBoxVariants, menuPopupBoxVariants, menuVariants } from "./variants.ts";

const slots = menuVariants();

// = --spacing-row (0.5rem); Base UI Positioner offsets are px numbers, not classes.
const DEFAULT_SIDE_OFFSET = ANCHOR_GAP_TRIGGER;
// The popup keeps this token's distance from every screen edge, resolved at open so it follows the text scale.
const EDGE_GAP_VAR = "--spacing-row";

/**
 * Menu root — seals Base UI Menu (roving highlight, typeahead, dismiss come free). State-only.
 * Generic over `Payload` like the popover/tooltip seals: a handle-driven menu reads the active
 * trigger's payload through the render-function `children`, and a non-generic wrap would type that
 * payload `unknown` at every call site.
 */
export function Menu<Payload = unknown>({ children, ...props }: BaseRootProps<Payload>): ReactElement {
  return <BaseMenu.Root {...props}>{children}</BaseMenu.Root>;
}

/** Opens the menu with a stable anchor box; compose its control via `render`. Accepts `handle` +
 *  `payload` (Base UI 1.x) to act as a DETACHED trigger for a handle-driven menu. */
export function MenuTrigger<Payload = unknown>({ className, ...props }: BaseTriggerProps<Payload>): ReactElement {
  return (
    <BaseMenu.Trigger className={(state): string => slots.trigger({ className: typeof className === "function" ? className(state) : className })} {...props} />
  );
}

export interface MenuPopupProps extends Omit<BasePopupProps, "className">, VariantProps<typeof menuPopupBoxVariants> {
  className?: string;
  /** Placement side, forwarded to the explicit Positioner. @defaultValue "bottom" */
  side?: BasePositionerProps["side"];
  /** Alignment on the side. @defaultValue "start" */
  align?: BasePositionerProps["align"];
  /** Anchor gap in px. @defaultValue 8 (= --spacing-row) */
  sideOffset?: BasePositionerProps["sideOffset"];
  /** Native collision handling for anchors in constrained scroll regions. */
  collisionAvoidance?: BasePositionerProps["collisionAvoidance"];
  /** Portal target — defaults to the themed portal root; pass a node/ref to override. */
  container?: PortalContainer;
  /** How far the viewport clamp reaches; `belowChrome` stops one topbar row short of the edge. @defaultValue "viewport" */
  clamp?: VariantProps<typeof menuVariants>["clamp"];
}

/** The menu surface — bundles Portal → Positioner → Popup so the anatomy can't be mis-assembled. */
export function MenuPopup(props: MenuPopupProps): ReactElement {
  const { className, cap, children, side, align = "start", sideOffset = DEFAULT_SIDE_OFFSET, collisionAvoidance, container, clamp, ...rest } = props;
  const portalContainer = usePortalContainer();
  return (
    <BaseMenu.Portal container={container ?? portalContainer}>
      <BaseMenu.Positioner
        align={align}
        className={slots.positioner()}
        collisionAvoidance={collisionAvoidance}
        collisionPadding={resolveCssLength(EDGE_GAP_VAR, ANCHOR_GAP_TRIGGER)}
        data-slot="menu-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <BaseMenu.Popup className={menuVariants({ clamp }).popup({ className: menuPopupBoxVariants({ cap, className }) })} data-slot="menu-popup" {...rest}>
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export type MenuViewportProps = Omit<BaseViewportProps, "className">;

/**
 * OPTIONAL transition container — render it INSIDE `<MenuPopup>`, wrapping the items, when ONE menu
 * is opened by several triggers and its contents change per trigger. It keeps the outgoing items
 * mounted through the swap so the change animates instead of snapping, and publishes
 * `data-activation-direction`/`data-transitioning` for that animation. A single-trigger menu needs
 * nothing here.
 */
export function MenuViewport(props: MenuViewportProps): ReactElement {
  return <BaseMenu.Viewport data-slot="menu-viewport" {...props} />;
}

export type MenuArrowProps = Omit<BaseArrowProps, "className">;

/** An arrow that points at the anchor — place inside `<MenuPopup>`. */
export function MenuArrow(props: MenuArrowProps): ReactElement {
  return <BaseMenu.Arrow className={slots.arrow()} data-slot="menu-arrow" {...props} />;
}

export interface MenuItemProps extends Omit<BaseItemProps, "className">, VariantProps<typeof menuItemBoxVariants> {
  className?: string;
  /** The item exists at one pointer class only: the overflow twin of a row control that stands down there. */
  hiddenAt?: keyof typeof HIDDEN_AT;
}

/** A selectable menu command (closes the menu on click by default). */
export function MenuItem(props: MenuItemProps): ReactElement {
  const { className, hiddenAt, cap, truncate, stacked, ...rest } = props;
  return (
    <BaseMenu.Item
      className={slots.item({
        className: menuItemBoxVariants({ cap, truncate, stacked, className: cn(hiddenAt === undefined ? undefined : HIDDEN_AT[hiddenAt], className) }),
      })}
      data-slot="menu-item"
      {...rest}
    />
  );
}

export type MenuSeparatorProps = Omit<ComponentProps<typeof BaseMenu.Separator>, "className">;

/** Visual divider between menu groups. */
export function MenuSeparator(props: MenuSeparatorProps): ReactElement {
  return <BaseMenu.Separator className={slots.separator()} {...props} />;
}

export type MenuGroupProps = Omit<BaseGroupProps, "className">;

/** Groups related items under one MenuGroupLabel — Base UI wires the label↔group aria association. */
export function MenuGroup(props: MenuGroupProps): ReactElement {
  return <BaseMenu.Group className={slots.group()} data-slot="menu-group" {...props} />;
}

export type MenuGroupLabelProps = Omit<BaseGroupLabelProps, "className">;

/** The heading for a MenuGroup — a muted section caption, auto-associated with its parent group. */
export function MenuGroupLabel(props: MenuGroupLabelProps): ReactElement {
  return <BaseMenu.GroupLabel className={slots.groupLabel()} data-slot="menu-group-label" {...props} />;
}

export type MenuCheckboxItemProps = Omit<BaseCheckboxItemProps, "className">;

/**
 * A toggle row (view/display toggles like "Show minimap"). Bakes Base UI's native
 * `CheckboxItemIndicator`. Default `closeOnClick` is `true`; pass `false` for a settings menu you
 * keep open while flipping several toggles.
 */
export function MenuCheckboxItem(props: MenuCheckboxItemProps): ReactElement {
  const { children, ...rest } = props;
  return (
    <BaseMenu.CheckboxItem className={slots.checkboxItem()} data-slot="menu-checkbox-item" {...rest}>
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

export type MenuRadioItemProps = Omit<BaseRadioItemProps, "className">;

/**
 * One option in a MenuRadioGroup — selecting it deselects its siblings. Default `closeOnClick` is
 * `false` (the menu stays open so the user can re-pick).
 */
export function MenuRadioItem(props: MenuRadioItemProps): ReactElement {
  const { children, ...rest } = props;
  return (
    <BaseMenu.RadioItem className={slots.radioItem()} data-slot="menu-radio-item" {...rest}>
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

export type MenuSubmenuTriggerProps = Omit<BaseSubmenuTriggerProps, "className">;

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
  const { children, ...rest } = props;
  return (
    <BaseMenu.SubmenuTrigger className={slots.submenuTrigger()} data-slot="menu-submenu-trigger" {...rest}>
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

export type MenuLinkItemProps = Omit<BaseLinkItemProps, "className">;

/** A navigating menu item — renders an `<a>` with `href`. Default `closeOnClick` is `false`. */
export function MenuLinkItem(props: MenuLinkItemProps): ReactElement {
  return <BaseMenu.LinkItem className={slots.linkItem()} data-slot="menu-link-item" {...props} />;
}

export type MenuBackdropProps = Omit<BaseBackdropProps, "className">;

/** An optional dimming overlay for a modal menu; render as a direct child of `<Menu>`. */
export function MenuBackdrop(props: MenuBackdropProps): ReactElement {
  return <BaseMenu.Backdrop className={slots.backdrop()} data-slot="menu-backdrop" {...props} />;
}
