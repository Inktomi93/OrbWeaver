import { Dialog as BaseDialog } from "@base-ui/react/dialog";

/**
 * A detached dialog handle — connects a `<Dialog handle={…}>` to detached `<DialogTrigger handle={…}>`
 * components AND drives the dialog imperatively (Base UI 1.x `createHandle`). This is the "one confirm
 * dialog opened from N sources without threading state" primitive: create ONE handle, hand it to the
 * Root, then open from anywhere.
 *
 * `handle.open(triggerId | null)` opens associated with a detached trigger (payload rides the trigger);
 * `handle.openWithPayload(payload)` opens WITHOUT any trigger association and sets the payload directly;
 * `handle.close()` closes; `handle.isOpen` reads state. The payload reaches `<Dialog>`'s render-function
 * children: `<Dialog handle={h}>{({ payload }) => …}</Dialog>`.
 *
 * Non-component export — lives in this sibling file so the seal `.tsx` stays component-only
 * (biome `useComponentExportOnlyModules`). Spec: ui-package-design §13 R2 (Popover/Dialog createHandle).
 */
export const createDialogHandle = BaseDialog.createHandle;

/** The handle object returned by {@link createDialogHandle}. Typed to your trigger payload. */
export type DialogHandle<Payload = unknown> = BaseDialog.Handle<Payload>;
