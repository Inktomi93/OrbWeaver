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
import type { VariantProps } from "tailwind-variants";
import { usePortalContainer } from "#lib";
import { drawerVariants } from "./variants";

type DrawerSide = NonNullable<VariantProps<typeof drawerVariants>["side"]>;

const SWIPE_BY_SIDE: Record<DrawerSide, "down" | "left" | "right"> = {
  bottom: "down",
  left: "left",
  right: "right",
};

export interface DrawerProps<Payload = unknown> extends Omit<BaseRootProps<Payload>, "swipeDirection">, VariantProps<typeof drawerVariants> {}

/**
 * Drawer root — seals Base UI Drawer (swipe-to-dismiss, focus trap, Esc, scroll lock come free).
 * State-only. `side` sets the swipe-dismiss direction and must match `side` on DrawerPopup.
 */
export function Drawer<Payload = unknown>(props: DrawerProps<Payload>): ReactElement {
  const { side = "bottom", ...rest } = props;
  return <BaseDrawer.Root swipeDirection={SWIPE_BY_SIDE[side]} {...rest} />;
}

/**
 * Opens the drawer. Unstyled passthrough — compose your own control via `render`. Accepts
 * `handle` + `payload` to act as a detached trigger for a handle-driven drawer.
 */
export function DrawerTrigger<Payload = unknown>(props: BaseTriggerProps<Payload>): ReactElement {
  return <BaseDrawer.Trigger {...props} />;
}

export interface DrawerPopupProps extends Omit<BasePopupProps, "className">, VariantProps<typeof drawerVariants> {
  className?: string;
  /** Portal target — defaults to the themed portal root from context; an explicit node/ref overrides. */
  container?: BasePortalProps["container"];
  /** Keep the portal mounted while the drawer is closed (preserve DOM/animations). @defaultValue false */
  keepMounted?: BasePortalProps["keepMounted"];
  /** Force-render the backdrop even when Base UI would suppress it (nested drawers). @defaultValue false */
  forceRender?: boolean;
}

/**
 * The drawer panel — bundles Portal → Backdrop → Viewport → Popup → Content at `--z-modal`. `side`
 * places the panel and must match the root's `side`.
 */
export function DrawerPopup(props: DrawerPopupProps): ReactElement {
  const { className, children, side, container, keepMounted, forceRender, ...rest } = props;
  // Defaults the Portal target to the themed root from context so a feature-level drawer inherits
  // the active ThemeScope instead of Hearth chrome; an explicit `container` still wins.
  const portalContainer = usePortalContainer();
  const slots = drawerVariants({ side });
  return (
    <BaseDrawer.Portal container={container ?? portalContainer} keepMounted={keepMounted}>
      <BaseDrawer.Backdrop className={slots.backdrop()} data-slot="drawer-backdrop" forceRender={forceRender} />
      <BaseDrawer.Viewport className={slots.viewport()} data-slot="drawer-viewport">
        <BaseDrawer.Popup className={slots.popup({ className })} data-slot="drawer-popup" {...rest}>
          <BaseDrawer.Content className={slots.content()} data-slot="drawer-content">
            {children}
          </BaseDrawer.Content>
        </BaseDrawer.Popup>
      </BaseDrawer.Viewport>
    </BaseDrawer.Portal>
  );
}

export interface DrawerTitleProps extends Omit<BaseTitleProps, "className"> {
  className?: string;
}

/** Accessible drawer heading (labels the panel for screen readers). */
export function DrawerTitle(props: DrawerTitleProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseDrawer.Title className={drawerVariants().title({ className })} {...rest} />;
}

export interface DrawerDescriptionProps extends Omit<BaseDescriptionProps, "className"> {
  className?: string;
}

/** Supporting copy under the drawer title (wired to `aria-describedby`). */
export function DrawerDescription(props: DrawerDescriptionProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseDrawer.Description className={drawerVariants().description({ className })} {...rest} />;
}

/** Closes the drawer. Unstyled passthrough — compose your own control via `render`. */
export function DrawerClose(props: BaseCloseProps): ReactElement {
  return <BaseDrawer.Close {...props} />;
}

export interface DrawerSwipeAreaProps extends Omit<BaseSwipeAreaProps, "className">, VariantProps<typeof drawerVariants> {
  className?: string;
}

/**
 * An invisible edge hit-target that opens the drawer on an edge swipe. Mount it as a sibling of
 * the drawer (always present, even while closed); `side` must match the drawer's `side`.
 */
export function DrawerSwipeArea(props: DrawerSwipeAreaProps): ReactElement {
  const { className, side, ...rest } = props;
  const slots = drawerVariants({ side });
  return <BaseDrawer.SwipeArea className={slots.swipeArea({ className })} data-slot="drawer-swipe-area" {...rest} />;
}

/**
 * Coordinates stacked/nested drawers within a subtree — provides the shared context that drives
 * the DrawerIndent/DrawerIndentBackground depth effect. Renders no element.
 */
export function DrawerProvider(props: BaseProviderProps): ReactElement {
  // @orb-gate-ignore no-context-provider Base UI's Drawer.Provider is a namespace COMPONENT, not a React Context — the React-19 `<Context.Provider>` deprecation the gate targets doesn't apply.
  return <BaseDrawer.Provider {...props} />;
}

export interface DrawerIndentProps extends Omit<BaseIndentProps, "className"> {
  className?: string;
}

/**
 * Wraps your app's main UI so it scales/insets behind an open drawer. Gets `data-active` when any
 * drawer within the nearest DrawerProvider is open. Must be inside a DrawerProvider.
 */
export function DrawerIndent(props: DrawerIndentProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseDrawer.Indent className={drawerVariants().indent({ className })} data-slot="drawer-indent" {...rest} />;
}

export interface DrawerIndentBackgroundProps extends Omit<BaseIndentBackgroundProps, "className"> {
  className?: string;
}

/**
 * The background layer rendered before DrawerIndent — peeks out from behind the scaled app when a
 * drawer opens. Must be inside a DrawerProvider.
 */
export function DrawerIndentBackground(props: DrawerIndentBackgroundProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseDrawer.IndentBackground className={drawerVariants().indentBackground({ className })} data-slot="drawer-indent-background" {...rest} />;
}

/**
 * Keyboard-aware wrapper for bottom-sheet drawers that host form fields — reflows content above
 * the mobile soft keyboard via `--drawer-keyboard-inset`. Must sit inside `<Drawer>` wrapping the
 * popup, not around the whole Drawer.
 */
export function DrawerVirtualKeyboardProvider(props: BaseVirtualKeyboardProviderProps): ReactElement {
  return <BaseDrawer.VirtualKeyboardProvider {...props} />;
}
