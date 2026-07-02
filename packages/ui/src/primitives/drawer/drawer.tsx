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
import { drawerVariants } from "./variants";

type DrawerSide = NonNullable<VariantProps<typeof drawerVariants>["side"]>;

const SWIPE_BY_SIDE: Record<DrawerSide, "down" | "left" | "right"> = {
  bottom: "down",
  left: "left",
  right: "right",
};

export interface DrawerProps<Payload = unknown>
  extends Omit<BaseRootProps<Payload>, "swipeDirection">,
    VariantProps<typeof drawerVariants> {}

/**
 * Drawer root — seals Base UI Drawer (swipe-to-dismiss with velocity, focus trap, Esc, and scroll
 * lock come free; do not reimplement). State-only. `side` sets the swipe-dismiss direction and
 * must match the `side` on DrawerPopup (both default to "bottom"). Generic over the detached-handle
 * `Payload` (see `createDrawerHandle`) — a render-function child receives `{ payload }`.
 * `<Drawer side="right"><DrawerTrigger>Open</DrawerTrigger><DrawerPopup side="right">…</DrawerPopup></Drawer>`
 * Spec: ui-package-design §6.1 dictate — Base UI NATIVE drawer (D54 dropped vaul).
 */
export function Drawer<Payload = unknown>(props: DrawerProps<Payload>): ReactElement {
  const { side = "bottom", ...rest } = props;
  return <BaseDrawer.Root swipeDirection={SWIPE_BY_SIDE[side]} {...rest} />;
}

/**
 * Opens the drawer. Unstyled passthrough — compose your own control via `render`.
 * `<DrawerTrigger render={<Button>Filters</Button>} />`
 * Spec: ui-package-design §6.1.
 */
export function DrawerTrigger(props: BaseTriggerProps): ReactElement {
  return <BaseDrawer.Trigger {...props} />;
}

export interface DrawerPopupProps
  extends Omit<BasePopupProps, "className">,
    VariantProps<typeof drawerVariants> {
  className?: string;
  /** Portal target — render the drawer into a specific container (default: document.body). */
  container?: BasePortalProps["container"];
  /** Keep the portal mounted while the drawer is closed (preserve DOM/animations). @default false */
  keepMounted?: BasePortalProps["keepMounted"];
  /** Force-render the backdrop even when Base UI would suppress it (nested drawers). @default false */
  forceRender?: boolean;
}

/**
 * The drawer panel — bundles Portal → Backdrop (`bg-scrim`) → Viewport → Popup (`bg-card`) →
 * Content (scrollable) at `--z-modal`. `side` places the panel and must match the root's `side`
 * (both default to "bottom").
 * `<DrawerPopup><DrawerTitle>Filters</DrawerTitle>…</DrawerPopup>`
 * Spec: ui-package-design §6.1 dictate — content panel bg-card; side variants left/right/bottom.
 */
export function DrawerPopup(props: DrawerPopupProps): ReactElement {
  const { className, children, side, container, keepMounted, forceRender, ...rest } = props;
  const slots = drawerVariants({ side });
  return (
    <BaseDrawer.Portal container={container} keepMounted={keepMounted}>
      <BaseDrawer.Backdrop
        className={slots.backdrop()}
        data-slot="drawer-backdrop"
        forceRender={forceRender}
      />
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

/**
 * Accessible drawer heading (labels the panel for screen readers).
 * `<DrawerTitle>Filters</DrawerTitle>`
 * Spec: ui-package-design §6.1.
 */
export function DrawerTitle(props: DrawerTitleProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseDrawer.Title className={drawerVariants().title({ className })} {...rest} />;
}

export interface DrawerDescriptionProps extends Omit<BaseDescriptionProps, "className"> {
  className?: string;
}

/**
 * Supporting copy under the drawer title (wired to `aria-describedby`).
 * `<DrawerDescription>Narrow the character list.</DrawerDescription>`
 * Spec: ui-package-design §6.1.
 */
export function DrawerDescription(props: DrawerDescriptionProps): ReactElement {
  const { className, ...rest } = props;
  return (
    <BaseDrawer.Description className={drawerVariants().description({ className })} {...rest} />
  );
}

/**
 * Closes the drawer. Unstyled passthrough — compose your own control via `render`.
 * `<DrawerClose render={<Button variant="ghost">Done</Button>} />`
 * Spec: ui-package-design §6.1.
 */
export function DrawerClose(props: BaseCloseProps): ReactElement {
  return <BaseDrawer.Close {...props} />;
}

export interface DrawerSwipeAreaProps
  extends Omit<BaseSwipeAreaProps, "className">,
    VariantProps<typeof drawerVariants> {
  className?: string;
}

/**
 * An invisible edge hit-target that opens the drawer on an edge swipe (Base UI native — the axis-4
 * mobile-reach gesture; the swipe direction defaults to the opposite of the drawer's dismiss
 * direction). Mount it as a SIBLING of the drawer (always present, even while closed); `side` pins it
 * to the matching screen edge and MUST match the drawer's `side`.
 * `<Drawer side="bottom"><DrawerSwipeArea side="bottom" /><DrawerPopup>…</DrawerPopup></Drawer>`
 * Spec: ui-package-design §13 R2 (§4b axis-4) — full native part surface.
 */
export function DrawerSwipeArea(props: DrawerSwipeAreaProps): ReactElement {
  const { className, side, ...rest } = props;
  const slots = drawerVariants({ side });
  return (
    <BaseDrawer.SwipeArea
      className={slots.swipeArea({ className })}
      data-slot="drawer-swipe-area"
      {...rest}
    />
  );
}

/**
 * Coordinates stacked/nested drawers within a subtree — provides the shared context that drives the
 * `<DrawerIndent>`/`<DrawerIndentBackground>` depth effect when any drawer inside it is open. Renders
 * no element; wrap the region (typically your whole app) that hosts drawers.
 * `<DrawerProvider><DrawerIndentBackground /><DrawerIndent><App /></DrawerIndent>…</DrawerProvider>`
 * Spec: ui-package-design §13 R2 — stacked-drawer depth.
 */
export function DrawerProvider(props: BaseProviderProps): ReactElement {
  return <BaseDrawer.Provider {...props} />;
}

export interface DrawerIndentProps extends Omit<BaseIndentProps, "className"> {
  className?: string;
}

/**
 * Wraps your app's main UI so it scales/insets behind an open drawer (the iOS stacked-sheet depth
 * cue). Gets `data-active` when any drawer within the nearest `<DrawerProvider>` is open. Must be
 * inside a `<DrawerProvider>`.
 * `<DrawerIndent><App /></DrawerIndent>`
 * Spec: ui-package-design §13 R2 — stacked-drawer depth.
 */
export function DrawerIndent(props: DrawerIndentProps): ReactElement {
  const { className, ...rest } = props;
  return (
    <BaseDrawer.Indent
      className={drawerVariants().indent({ className })}
      data-slot="drawer-indent"
      {...rest}
    />
  );
}

export interface DrawerIndentBackgroundProps extends Omit<BaseIndentBackgroundProps, "className"> {
  className?: string;
}

/**
 * The background layer rendered BEFORE `<DrawerIndent>` — it peeks out from behind the scaled app
 * when a drawer opens. Gets `data-active` alongside `<DrawerIndent>`. Must be inside a
 * `<DrawerProvider>`.
 * `<DrawerProvider><DrawerIndentBackground /><DrawerIndent>…</DrawerIndent></DrawerProvider>`
 * Spec: ui-package-design §13 R2 — stacked-drawer depth.
 */
export function DrawerIndentBackground(props: DrawerIndentBackgroundProps): ReactElement {
  const { className, ...rest } = props;
  return (
    <BaseDrawer.IndentBackground
      className={drawerVariants().indentBackground({ className })}
      data-slot="drawer-indent-background"
      {...rest}
    />
  );
}

/**
 * Keyboard-aware wrapper for bottom-sheet drawers that host form fields — reflows the drawer content
 * ABOVE the mobile soft keyboard (the §4b axis-4 solution) by tracking the visual viewport and
 * exposing `--drawer-keyboard-inset` on the Viewport. Structural: renders no element of its own.
 * PLACEMENT (verified against the shipped source, §13 R6): it consumes the Drawer root context +
 * viewport, so it must sit INSIDE `<Drawer>` wrapping the popup — NOT around the whole Drawer.
 * `<Drawer><DrawerTrigger>…</DrawerTrigger><DrawerVirtualKeyboardProvider><DrawerPopup>…</DrawerPopup></DrawerVirtualKeyboardProvider></Drawer>`
 * Spec: ui-package-design §4b axis-4 / §13 R2.
 */
export function DrawerVirtualKeyboardProvider(
  props: BaseVirtualKeyboardProviderProps,
): ReactElement {
  return <BaseDrawer.VirtualKeyboardProvider {...props} />;
}
