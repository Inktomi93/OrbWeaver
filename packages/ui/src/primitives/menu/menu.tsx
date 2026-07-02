import type {
  MenuGroupLabelProps as BaseGroupLabelProps,
  MenuGroupProps as BaseGroupProps,
  MenuItemProps as BaseItemProps,
  MenuPopupProps as BasePopupProps,
  MenuPositionerProps as BasePositionerProps,
  MenuRootProps as BaseRootProps,
  MenuTriggerProps as BaseTriggerProps,
} from "@base-ui/react/menu";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ComponentProps, ReactElement } from "react";
import { menuVariants } from "./variants";

const slots = menuVariants();

// = --spacing-row (0.5rem) — Base UI Positioner offsets are px numbers, not classes.
const DEFAULT_SIDE_OFFSET = 8;

/**
 * Menu root — seals Base UI Menu (arrow-key roving highlight, typeahead, Enter/Space select, and
 * Esc/outside dismiss come free; do not reimplement). State-only.
 * `<Menu><MenuTrigger>Actions</MenuTrigger><MenuPopup><MenuItem>Rename</MenuItem></MenuPopup></Menu>`
 * Spec: ui-package-design §6.1 / UI-Arch §2 (Base UI is THE headless primitive, D42).
 */
export function Menu(props: BaseRootProps): ReactElement {
  return <BaseMenu.Root {...props} />;
}

/**
 * Opens the menu. Unstyled passthrough — compose your own control via `render`.
 * `<MenuTrigger render={<Button variant="ghost">Actions</Button>} />`
 * Spec: ui-package-design §6.1.
 */
export function MenuTrigger(props: BaseTriggerProps): ReactElement {
  return <BaseMenu.Trigger {...props} />;
}

export interface MenuPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  /** Placement side, forwarded to the explicit Positioner. @default "bottom" (Base UI default) */
  side?: BasePositionerProps["side"];
  /** Alignment on the side. @default "start" */
  align?: BasePositionerProps["align"];
  /** Anchor gap in px. @default 8 (= --spacing-row) */
  sideOffset?: BasePositionerProps["sideOffset"];
}

/**
 * The menu surface — bundles Portal → Positioner (`--z-overlay`, token-safe sideOffset default)
 * → Popup so the anatomy cannot be mis-assembled.
 * `<MenuPopup><MenuItem onClick={rename}>Rename</MenuItem></MenuPopup>`
 * Spec: ui-package-design §6.1 dictate — explicit Positioner with a token-safe sideOffset default.
 */
export function MenuPopup(props: MenuPopupProps): ReactElement {
  const {
    className,
    children,
    side,
    align = "start",
    sideOffset = DEFAULT_SIDE_OFFSET,
    ...rest
  } = props;
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        align={align}
        className={slots.positioner()}
        data-slot="menu-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <BaseMenu.Popup className={slots.popup({ className })} data-slot="menu-popup" {...rest}>
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export interface MenuItemProps extends Omit<BaseItemProps, "className"> {
  className?: string;
}

/**
 * A selectable menu command (closes the menu on click by default — Base UI `closeOnClick`).
 * `<MenuItem onClick={duplicate}>Duplicate</MenuItem>`
 * Spec: ui-package-design §6.1; touch floor per UI-Arch §4b axis 3.
 */
export function MenuItem(props: MenuItemProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.Item className={slots.item({ className })} data-slot="menu-item" {...rest} />;
}

export interface MenuSeparatorProps
  extends Omit<ComponentProps<typeof BaseMenu.Separator>, "className"> {
  className?: string;
}

/**
 * Visual divider between menu groups (`role="separator"` from Base UI).
 * `<MenuSeparator />`
 * Spec: ui-package-design §6.1.
 */
export function MenuSeparator(props: MenuSeparatorProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.Separator className={slots.separator({ className })} {...rest} />;
}

export interface MenuGroupProps extends Omit<BaseGroupProps, "className"> {
  className?: string;
}

/**
 * Groups related items with an accessible label (pair with MenuGroupLabel).
 * `<MenuGroup><MenuGroupLabel>Sort</MenuGroupLabel>…</MenuGroup>`
 * Spec: ui-package-design §6.1.
 */
export function MenuGroup(props: MenuGroupProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.Group className={slots.group({ className })} {...rest} />;
}

export interface MenuGroupLabelProps extends Omit<BaseGroupLabelProps, "className"> {
  className?: string;
}

/**
 * The accessible label of a MenuGroup.
 * `<MenuGroupLabel>View</MenuGroupLabel>`
 * Spec: ui-package-design §6.1.
 */
export function MenuGroupLabel(props: MenuGroupLabelProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.GroupLabel className={slots.groupLabel({ className })} {...rest} />;
}
