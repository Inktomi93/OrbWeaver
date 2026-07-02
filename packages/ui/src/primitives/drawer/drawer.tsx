import type {
  DrawerCloseProps as BaseCloseProps,
  DrawerDescriptionProps as BaseDescriptionProps,
  DrawerPopupProps as BasePopupProps,
  DrawerRootProps as BaseRootProps,
  DrawerTitleProps as BaseTitleProps,
  DrawerTriggerProps as BaseTriggerProps,
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

export interface DrawerProps
  extends Omit<BaseRootProps, "swipeDirection">,
    VariantProps<typeof drawerVariants> {}

/**
 * Drawer root — seals Base UI Drawer (swipe-to-dismiss with velocity, focus trap, Esc, and scroll
 * lock come free; do not reimplement). State-only. `side` sets the swipe-dismiss direction and
 * must match the `side` on DrawerPopup (both default to "bottom").
 * `<Drawer side="right"><DrawerTrigger>Open</DrawerTrigger><DrawerPopup side="right">…</DrawerPopup></Drawer>`
 * Spec: ui-package-design §6.1 dictate — Base UI NATIVE drawer (D54 dropped vaul).
 */
export function Drawer(props: DrawerProps): ReactElement {
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
}

/**
 * The drawer panel — bundles Portal → Backdrop (`bg-scrim`) → Viewport → Popup (`bg-card`) →
 * Content (scrollable) at `--z-modal`. `side` places the panel and must match the root's `side`
 * (both default to "bottom").
 * `<DrawerPopup><DrawerTitle>Filters</DrawerTitle>…</DrawerPopup>`
 * Spec: ui-package-design §6.1 dictate — content panel bg-card; side variants left/right/bottom.
 */
export function DrawerPopup(props: DrawerPopupProps): ReactElement {
  const { className, children, side, ...rest } = props;
  const slots = drawerVariants({ side });
  return (
    <BaseDrawer.Portal>
      <BaseDrawer.Backdrop className={slots.backdrop()} data-slot="drawer-backdrop" />
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
