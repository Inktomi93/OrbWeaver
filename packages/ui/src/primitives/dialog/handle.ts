import { Dialog as BaseDialog } from "@base-ui/react/dialog";

// A detached dialog handle — connects a `<Dialog handle={...}>` to detached `<DialogTrigger handle={...}>`
// components and drives the dialog imperatively: create ONE handle, hand it to the Root, open from anywhere.
export const createDialogHandle = BaseDialog.createHandle;
