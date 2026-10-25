import { RowActionsMenu } from "@orb/client/components";
import { Button } from "@orb/ui/button";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useRef } from "react";

/** A caller that hands focus back to the ⋯ trigger of a row's actions menu through the trigger ref. */
export function RowActionsTriggerRefStory(): ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button onClick={(): void => triggerRef.current?.focus()}>Hand focus back</Button>
      <RowActionsMenu label="Actions for The Crimson Court" triggerRef={triggerRef}>
        <MenuItem>Duplicate</MenuItem>
      </RowActionsMenu>
    </>
  );
}
