// The new-character form's request host, mounted in every layout of the Characters section (its list and its content: a
// phone's list screen mounts no content, a collapsed list mounts no list body). It takes the request the command palette files
// and opens the one `NewCharacterDialog`, so the form opens from any section without a second visible door. On close, focus
// returns to the New door of the layout, or to the screen heading where this layout mounts none.

import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { onNewCharacterRequest, shellHeading, takeNewCharacterRequest, visibleNewCharacterDoor } from "#state";
import { NewCharacterDialog } from "./character-create-actions.tsx";

function returnFocusTarget(): HTMLElement | true {
  return visibleNewCharacterDoor() ?? shellHeading() ?? true;
}

export function NewCharacterHost(): ReactElement {
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      onNewCharacterRequest((): void => {
        if (takeNewCharacterRequest()) {
          setOpen(true);
        }
      }),
    [],
  );
  return <NewCharacterDialog finalFocus={returnFocusTarget} onOpenChange={setOpen} open={open} />;
}
