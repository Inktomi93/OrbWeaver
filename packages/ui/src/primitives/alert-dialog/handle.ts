import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";

// A detached alert-dialog handle — the "one confirm dialog opened from N destructive sources" primitive.
export const createAlertDialogHandle = BaseAlertDialog.createHandle;
