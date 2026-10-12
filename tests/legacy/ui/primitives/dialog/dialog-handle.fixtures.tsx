// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). Exercises the detached dialog handle:
// `handle.openWithPayload(payload)` opens the dialog imperatively WITHOUT any trigger association and
// routes the payload to the Root's render-function children — the "one confirm dialog opened from N
// sources without threading state" primitive (Base UI 1.x createHandle).
import { createDialogHandle, Dialog, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import type { ReactElement } from "react";
import { useState } from "react";

export function DialogHandleHarness(): ReactElement {
  const [handle] = useState(() => createDialogHandle<string>());
  return (
    <>
      <button
        onClick={(): void => {
          handle.openWithPayload("Reached content");
        }}
        type="button"
      >
        Open remotely
      </button>
      <Dialog handle={handle}>
        {({ payload }): ReactElement => (
          <DialogPopup>
            <DialogTitle>Remote</DialogTitle>
            <DialogDescription>{payload ?? "no payload"}</DialogDescription>
          </DialogPopup>
        )}
      </Dialog>
    </>
  );
}
