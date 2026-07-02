import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";

/**
 * A detached alert-dialog handle — connects a `<AlertDialog handle={…}>` to detached
 * `<AlertDialogTrigger handle={…}>` components AND drives it imperatively (Base UI 1.x `createHandle`).
 * The "one confirm dialog opened from N destructive sources" primitive: create ONE handle, hand it to
 * the Root, then confirm from anywhere.
 *
 * `handle.open(triggerId | null)` opens associated with a detached trigger (payload rides the trigger);
 * `handle.openWithPayload(payload)` opens WITHOUT trigger association and sets the payload directly;
 * `handle.close()` closes; `handle.isOpen` reads state. The payload reaches `<AlertDialog>`'s
 * render-function children: `<AlertDialog handle={h}>{({ payload }) => …}</AlertDialog>`.
 *
 * Non-component export — lives in this sibling file so the seal `.tsx` stays component-only
 * (biome `useComponentExportOnlyModules`). Spec: ui-package-design §13 R2.
 */
export const createAlertDialogHandle = BaseAlertDialog.createHandle;

/** The handle object returned by {@link createAlertDialogHandle}. Typed to your trigger payload. */
export type AlertDialogHandle<Payload = unknown> = BaseAlertDialog.Handle<Payload>;
