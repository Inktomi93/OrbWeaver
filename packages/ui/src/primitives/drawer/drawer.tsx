import type {
  DrawerCloseProps as BaseCloseProps,
  DrawerDescriptionProps as BaseDescriptionProps,
  DrawerIndentBackgroundProps as BaseIndentBackgroundProps,
  DrawerIndentProps as BaseIndentProps,
  DrawerPopupProps as BasePopupProps,
  DrawerPortalProps as BasePortalProps,
  DrawerProviderProps as BaseProviderProps,
  DrawerRootProps as BaseRootProps,
  DrawerSwipeAreaProps as BaseSwipeAreaProps,
  DrawerTitleProps as BaseTitleProps,
  DrawerTriggerProps as BaseTriggerProps,
  DrawerVirtualKeyboardProviderProps as BaseVirtualKeyboardProviderProps,
} from "@base-ui/react/drawer";
import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import type { ReactElement } from "react";
import { usePortalContainer } from "#lib";
import { drawerVariants } from "./variants.ts";

export type DrawerProps<Payload = unknown> = Omit<BaseRootProps<Payload>, "swipeDirection">;

/**
 * Drawer root — seals Base UI Drawer (swipe-to-dismiss, focus trap, Esc, scroll lock come free).
 * State-only. The sheet rises from the bottom edge and dismisses by swiping down.
 */
export function Drawer<Payload = unknown>(props: DrawerProps<Payload>): ReactElement {
  const { children, ...rest } = props;
  return (
    <BaseDrawer.Root swipeDirection="down" {...rest}>
      {children}
    </BaseDrawer.Root>
  );
}

/**
 * Opens the drawer. Unstyled passthrough — compose your own control via `render`. Accepts
 * `handle` + `payload` to act as a detached trigger for a handle-driven drawer.
 */
export function DrawerTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  return <BaseDrawer.Trigger {...props} />;
}

export interface DrawerPopupProps extends Omit<BasePopupProps, "className"> {
  /** Portal target — defaults to the themed portal root from context; an explicit node/ref overrides. */
  container?: BasePortalProps["container"];
  /** Keep the portal mounted while the drawer is closed (preserve DOM/animations). @defaultValue false */
  keepMounted?: BasePortalProps["keepMounted"];
  /** Force-render the backdrop even when Base UI would suppress it (nested drawers). @defaultValue false */
  forceRender?: boolean;
}

/**
 * The drawer panel — bundles Portal → Backdrop → Viewport → Popup → Content at `--z-modal`, anchored to the bottom edge.
 */
export function DrawerPopup(props: DrawerPopupProps): ReactElement {
  const { children, container, keepMounted, forceRender, ...rest } = props;
  // Defaults the Portal target to the themed root from context so a feature-level drawer inherits
  // the active ThemeScope instead of Hearth chrome; an explicit `container` still wins.
  const portalContainer = usePortalContainer();
  const slots = drawerVariants();
  return (
    <BaseDrawer.Portal container={container ?? portalContainer} keepMounted={keepMounted}>
      <BaseDrawer.Backdrop className={slots.backdrop()} data-slot="drawer-backdrop" forceRender={forceRender} />
      <BaseDrawer.Viewport className={slots.viewport()} data-slot="drawer-viewport">
        <BaseDrawer.Popup className={slots.popup()} data-slot="drawer-popup" {...rest}>
          <BaseDrawer.Content className={slots.content()} data-slot="drawer-content">
            {children}
          </BaseDrawer.Content>
        </BaseDrawer.Popup>
      </BaseDrawer.Viewport>
    </BaseDrawer.Portal>
  );
}

export type DrawerTitleProps = Omit<BaseTitleProps, "className">;

/** Accessible drawer heading (labels the panel for screen readers). */
export function DrawerTitle(props: DrawerTitleProps): ReactElement {
  return <BaseDrawer.Title className={drawerVariants().title()} {...props} />;
}

export type DrawerDescriptionProps = Omit<BaseDescriptionProps, "className">;

/** Supporting copy under the drawer title (wired to `aria-describedby`). */
export function DrawerDescription(props: DrawerDescriptionProps): ReactElement {
  return <BaseDrawer.Description className={drawerVariants().description()} {...props} />;
}

/** Closes the drawer. Unstyled passthrough — compose your own control via `render`. */
export function DrawerClose(props: BaseCloseProps): ReactElement {
  return <BaseDrawer.Close {...props} />;
}

export type DrawerSwipeAreaProps = Omit<BaseSwipeAreaProps, "className">;

/**
 * An invisible edge hit-target that opens the drawer on an edge swipe. Mount it as a sibling of
 * the drawer (always present, even while closed).
 */
export function DrawerSwipeArea(props: DrawerSwipeAreaProps): ReactElement {
  return <BaseDrawer.SwipeArea className={drawerVariants().swipeArea()} data-slot="drawer-swipe-area" {...props} />;
}

/**
 * Coordinates stacked/nested drawers within a subtree — provides the shared context that drives
 * the DrawerIndent/DrawerIndentBackground depth effect. Renders no element.
 */
export function DrawerProvider(props: BaseProviderProps): ReactElement {
  return <BaseDrawer.Provider {...props} />;
}

export type DrawerIndentProps = Omit<BaseIndentProps, "className">;

/**
 * Wraps your app's main UI so it scales/insets behind an open drawer. Gets `data-active` when any
 * drawer within the nearest DrawerProvider is open. Must be inside a DrawerProvider.
 */
export function DrawerIndent(props: DrawerIndentProps): ReactElement {
  return <BaseDrawer.Indent className={drawerVariants().indent()} data-slot="drawer-indent" {...props} />;
}

export type DrawerIndentBackgroundProps = Omit<BaseIndentBackgroundProps, "className">;

/**
 * The background layer rendered before DrawerIndent — peeks out from behind the scaled app when a
 * drawer opens. Must be inside a DrawerProvider.
 */
export function DrawerIndentBackground(props: DrawerIndentBackgroundProps): ReactElement {
  return <BaseDrawer.IndentBackground className={drawerVariants().indentBackground()} data-slot="drawer-indent-background" {...props} />;
}

/**
 * Keyboard-aware wrapper for bottom-sheet drawers that host form fields — reflows content above
 * the mobile soft keyboard via `--drawer-keyboard-inset`. Must sit inside `<Drawer>` wrapping the
 * popup, not around the whole Drawer.
 */
export function DrawerVirtualKeyboardProvider(props: BaseVirtualKeyboardProviderProps): ReactElement {
  return <BaseDrawer.VirtualKeyboardProvider {...props} />;
}
