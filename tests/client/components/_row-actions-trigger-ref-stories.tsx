import { RowActionsMenu } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useRef } from "react";

/** A caller that hands focus back to the ⋯ trigger of a row's actions menu through the trigger ref. */
export function RowActionsTriggerRefStory(): ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <CtIsolation subject="RowActionsMenu" isolates="The menu hands a trigger ref to its caller and reads no application data.">
      <Button onClick={(): void => triggerRef.current?.focus()}>Hand focus back</Button>
      <RowActionsMenu label="Actions for The Crimson Court" triggerRef={triggerRef}>
        <MenuItem>Duplicate</MenuItem>
      </RowActionsMenu>
    </CtIsolation>
  );
}
