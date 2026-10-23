import { CtIsolation } from "@orb/testkit/browser";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
  createAlertDialogHandle,
} from "@orb/ui/alert-dialog";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { useState } from "react";

export function AlertDialogNativePartsStory(): ReactElement {
  const [handle] = useState(() => createAlertDialogHandle<string>());
  const [confirmed, setConfirmed] = useState<string | null>(null);
  return (
    <CtIsolation subject="AlertDialog" isolates="The confirmation boundary exercises native modal behavior without destructive application operations.">
      <Button onClick={(): void => handle.openWithPayload("Remote draft")}>Delete remotely</Button>
      <AlertDialogTrigger handle={handle} payload="Selected draft">
        Delete selected
      </AlertDialogTrigger>
      <output aria-label="Confirmed deletion">{confirmed ?? "Nothing deleted"}</output>
      <AlertDialog handle={handle}>
        {({ payload }): ReactElement => (
          <AlertDialogPopup>
            <AlertDialogTitle>Delete draft?</AlertDialogTitle>
            <AlertDialogDescription>{payload}</AlertDialogDescription>
            <AlertDialogActions>
              <AlertDialogClose>Cancel</AlertDialogClose>
              <AlertDialogClose onClick={(): void => setConfirmed(payload ?? null)}>Confirm deletion</AlertDialogClose>
            </AlertDialogActions>
          </AlertDialogPopup>
        )}
      </AlertDialog>
    </CtIsolation>
  );
}
