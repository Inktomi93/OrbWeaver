// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). Exercises the detached alert-dialog handle:
// `handle.openWithPayload(payload)` opens it imperatively WITHOUT any trigger association and routes
// the payload to the Root render-function children — one confirm dialog opened from N destructive
// sources without threading state (Base UI 1.x createHandle).
import { AlertDialog, AlertDialogDescription, AlertDialogPopup, AlertDialogTitle, createAlertDialogHandle } from "@orb/ui/alert-dialog";
import type { ReactElement } from "react";
import { useState } from "react";

export function AlertDialogHandleHarness(): ReactElement {
  const [handle] = useState(() => createAlertDialogHandle<string>());
  return (
    <>
      <button
        onClick={(): void => {
          handle.openWithPayload("Reached content");
        }}
        type="button"
      >
        Delete remotely
      </button>
      <AlertDialog handle={handle}>
        {({ payload }): ReactElement => (
          <AlertDialogPopup>
            <AlertDialogTitle>Confirm</AlertDialogTitle>
            <AlertDialogDescription>{payload ?? "no payload"}</AlertDialogDescription>
          </AlertDialogPopup>
        )}
      </AlertDialog>
    </>
  );
}
