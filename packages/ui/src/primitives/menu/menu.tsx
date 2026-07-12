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
} from "@base-ui/react/menu";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ComponentProps, ReactElement } from "react";
import type { PortalContainer } from "#lib";
import { ANCHOR_GAP_TRIGGER, usePortalContainer } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Check/ChevronRight/Icon fine (the spinner.tsx precedent).
import { Check, ChevronRight, Icon } from "#primitives/icons";
import { menuVariants } from "./variants";

const slots = menuVariants();

// The trigger-breathe gap (§13.0 C19 rollup, `#lib`) — = --spacing-row (0.5rem); Base UI Positioner
// offsets are px numbers, not classes.
const DEFAULT_SIDE_OFFSET = ANCHOR_GAP_TRIGGER;

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
 * `<MenuTrigger render={<Button intent="ghost">Actions</Button>} />`
 * Spec: ui-package-design §6.1.
 */
export function MenuTrigger(props: BaseTriggerProps): ReactElement {
  return <BaseMenu.Trigger {...props} />;
}

export interface MenuPopupProps extends Omit<BasePopupProps, "className"> {
  className?: string;
  /** Placement side, forwarded to the explicit Positioner. @defaultValue "bottom" (Base UI default) */
  side?: BasePositionerProps["side"];
  /** Alignment on the side. @defaultValue "start" */
  align?: BasePositionerProps["align"];
  /** Anchor gap in px. @defaultValue 8 (= --spacing-row) */
  sideOffset?: BasePositionerProps["sideOffset"];
  /** Portal target — defaults to the themed portal root from {@link usePortalContainer} (D44 §12.1);
   *  pass an explicit node/ref to override; unset keeps Base UI's `body` default. */
  container?: PortalContainer;
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
    container,
    ...rest
  } = props;
  const portalContainer = usePortalContainer();
  return (
    <BaseMenu.Portal container={container ?? portalContainer}>
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

export interface MenuArrowProps extends Omit<BaseArrowProps, "className"> {
  className?: string;
}

/**
 * An arrow that points at the anchor — place inside `<MenuPopup>`. Base UI positions it and sets
 * `data-side`/`data-align`; skinned as a `bg-popover` diamond that continues the popup edge (mirrors
 * `PopoverArrow`).
 * `<MenuPopup><MenuArrow /><MenuItem>…</MenuItem></MenuPopup>`
 * Spec: ui-package-design §13 R2 (full native part surface).
 */
export function MenuArrow(props: MenuArrowProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseMenu.Arrow className={slots.arrow({ className })} data-slot="menu-arrow" {...rest} />;
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

export interface MenuCheckboxItemProps extends Omit<BaseCheckboxItemProps, "className"> {
  className?: string;
}

/**
 * A toggle row — `aria-checked` on/off (view/display toggles like "Show minimap"). Bakes Base UI's
 * native `CheckboxItemIndicator` (R3 — never a hand-rolled checkmark); the leading check appears only
 * while checked. Control with `checked`/`onCheckedChange` or leave uncontrolled via `defaultChecked`.
 * Base UI default `closeOnClick` is `true` here (a checkbox click closes the menu) — pass
 * `closeOnClick={false}` for a settings menu you keep open while flipping several toggles.
 * `<MenuCheckboxItem checked={dense} onCheckedChange={setDense}>Compact rows</MenuCheckboxItem>`
 * Spec: ui-package-design §13 R2 (full 1.6 vocabulary).
 */
export function MenuCheckboxItem(props: MenuCheckboxItemProps): ReactElement {
  const { className, children, ...rest } = props;
  return (
    <BaseMenu.CheckboxItem
      className={slots.checkboxItem({ className })}
      data-slot="menu-checkbox-item"
      {...rest}
    >
      <BaseMenu.CheckboxItemIndicator className={slots.itemIndicator()}>
        <Icon icon={Check} size="sm" />
      </BaseMenu.CheckboxItemIndicator>
      {children}
    </BaseMenu.CheckboxItem>
  );
}

/**
 * Groups radio items into one single-select set (sort-by, view-mode pickers). `value`/`onValueChange`
 * (or `defaultValue`) drive the selection; each child `MenuRadioItem` carries its own `value`.
 * `<MenuRadioGroup value={sort} onValueChange={setSort}>…</MenuRadioGroup>`
 * Spec: ui-package-design §13 R2.
 */
export function MenuRadioGroup(props: BaseRadioGroupProps): ReactElement {
  return <BaseMenu.RadioGroup {...props} />;
}

export interface MenuRadioItemProps extends Omit<BaseRadioItemProps, "className"> {
  className?: string;
}

/**
 * One option in a MenuRadioGroup — selecting it deselects its siblings (`aria-checked` single-select).
 * Bakes Base UI's native `RadioItemIndicator` (R3). Base UI default `closeOnClick` is `false` (the
 * menu stays open so the user can re-pick), matching the sort-by pattern.
 * `<MenuRadioItem value="date">Date</MenuRadioItem>`
 * Spec: ui-package-design §13 R2.
 */
export function MenuRadioItem(props: MenuRadioItemProps): ReactElement {
  const { className, children, ...rest } = props;
  return (
    <BaseMenu.RadioItem
      className={slots.radioItem({ className })}
      data-slot="menu-radio-item"
      {...rest}
    >
      <BaseMenu.RadioItemIndicator className={slots.itemIndicator()}>
        <Icon icon={Check} size="sm" />
      </BaseMenu.RadioItemIndicator>
      {children}
    </BaseMenu.RadioItem>
  );
}

/**
 * Groups all parts of a nested submenu — wraps a `MenuSubmenuTrigger` and the submenu's own
 * `MenuPopup`. Renders no element of its own.
 * `<MenuSubmenuRoot><MenuSubmenuTrigger>More</MenuSubmenuTrigger><MenuPopup>…</MenuPopup></MenuSubmenuRoot>`
 * Spec: ui-package-design §13 R2 (nested menus).
 */
export function MenuSubmenuRoot(props: BaseSubmenuRootProps): ReactElement {
  return <BaseMenu.SubmenuRoot {...props} />;
}

export interface MenuSubmenuTriggerProps extends Omit<BaseSubmenuTriggerProps, "className"> {
  className?: string;
}

/**
 * The row that opens a nested submenu — a menu item that also carries a trailing chevron. Opens on
 * hover and on ArrowRight; ArrowLeft closes it (Base UI keyboard contract, R8). Pair inside a
 * `MenuSubmenuRoot` with the submenu's `MenuPopup`.
 * `<MenuSubmenuTrigger>Add to playlist</MenuSubmenuTrigger>`
 * Spec: ui-package-design §13 R2.
 */
export function MenuSubmenuTrigger(props: MenuSubmenuTriggerProps): ReactElement {
  const { className, children, ...rest } = props;
  return (
    <BaseMenu.SubmenuTrigger
      className={slots.submenuTrigger({ className })}
      data-slot="menu-submenu-trigger"
      {...rest}
    >
      {children}
      <Icon className={slots.itemIndicator()} icon={ChevronRight} size="sm" />
    </BaseMenu.SubmenuTrigger>
  );
}

export interface MenuLinkItemProps extends Omit<BaseLinkItemProps, "className"> {
  className?: string;
}

/**
 * A navigating menu item — renders an `<a>` with `href` (open docs, jump to a route). Default
 * `closeOnClick` is `false` so navigation isn't racing the close animation. Accepts any anchor attr.
 * `<MenuLinkItem href="/settings">Settings</MenuLinkItem>`
 * Spec: ui-package-design §13 R2.
 */
export function MenuLinkItem(props: MenuLinkItemProps): ReactElement {
  const { className, ...rest } = props;
  return (
    <BaseMenu.LinkItem
      className={slots.linkItem({ className })}
      data-slot="menu-link-item"
      {...rest}
    />
  );
}

export interface MenuBackdropProps extends Omit<BaseBackdropProps, "className"> {
  className?: string;
}

/**
 * An optional dimming overlay for a modal menu that should scrim/block the page while open. Renders a
 * `fixed inset-0` element wearing the theme-aware `bg-scrim`; it reads the Menu open state and hides
 * itself when the menu closes. Render it as a direct child of `<Menu>` alongside the trigger/popup.
 * `<Menu><MenuTrigger>…</MenuTrigger><MenuBackdrop /><MenuPopup>…</MenuPopup></Menu>`
 * Spec: ui-package-design §13 R2.
 */
export function MenuBackdrop(props: MenuBackdropProps): ReactElement {
  const { className, ...rest } = props;
  return (
    <BaseMenu.Backdrop
      className={slots.backdrop({ className })}
      data-slot="menu-backdrop"
      {...rest}
    />
  );
}
