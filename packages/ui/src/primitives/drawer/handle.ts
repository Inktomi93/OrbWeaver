import { Drawer as BaseDrawer } from "@base-ui/react/drawer";

/**
 * A detached drawer handle — connects a `<Drawer handle={…}>` to detached `<DrawerTrigger handle={…}>`
 * components AND drives it imperatively (Base UI 1.x `createHandle`). Base UI's drawer re-exports the
 * dialog handle mechanism, so this mirrors `createAlertDialogHandle` exactly. The "one drawer opened
 * from N sources" primitive: create ONE handle, hand it to the Root, then open from anywhere.
 *
 * `handle.open(triggerId | null)` opens associated with a detached trigger (payload rides the trigger);
 * `handle.openWithPayload(payload)` opens WITHOUT trigger association and sets the payload directly;
 * `handle.close()` closes; `handle.isOpen` reads state.
 *
 * Non-component export — lives in this sibling file so the seal `.tsx` stays component-only
 * (biome `useComponentExportOnlyModules`). Spec: ui-package-design §13 R2.
 */
export const createDrawerHandle = BaseDrawer.createHandle;

/** The handle object returned by {@link createDrawerHandle}. Typed to your trigger payload. */
export type DrawerHandle<Payload = unknown> = BaseDrawer.Handle<Payload>;
