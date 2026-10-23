import { CtIsolation } from "@orb/testkit/browser/ct-isolated-subject.tsx";
import { Button } from "@orb/ui/button";
import { createDialogHandle, Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle, DialogTrigger } from "@orb/ui/dialog";
import type { ReactElement } from "react";
import { useState } from "react";

export function DialogNativePartsStory(): ReactElement {
  const [handle] = useState(() => createDialogHandle<string>());
  return (
    <CtIsolation subject="Dialog" isolates="Native handle payload and description association need no application services.">
      <Button onClick={(): void => handle.openWithPayload("Remote settings")}>Open remotely</Button>
      <DialogTrigger handle={handle} payload="Account settings">
        Open account
      </DialogTrigger>
      <Dialog handle={handle}>
        {({ payload }): ReactElement => (
          <DialogPopup>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>{payload}</DialogDescription>
            <DialogClose>Done</DialogClose>
          </DialogPopup>
        )}
      </Dialog>
    </CtIsolation>
  );
}
