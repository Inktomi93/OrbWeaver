import { Drawer as BaseDrawer } from "@base-ui/react/drawer";

// A detached drawer handle — the "one drawer opened from N sources" primitive; mirrors createAlertDialogHandle.
export const createDrawerHandle = BaseDrawer.createHandle;

export type DrawerHandle<Payload = unknown> = BaseDrawer.Handle<Payload>;
