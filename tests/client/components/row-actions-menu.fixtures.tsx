// CT harness for `RowActionsMenu`'s TRIGGER SIZE axis (not a spec — Playwright CT needs mounted
// components in their own module, and biome forbids exporting a component from a `.ct.tsx`).
//
// One story per arm of `triggerSize`, each in a row root so `ROW_REVEAL` has the `group` it keys on.
// A `LucideIcon` is a FUNCTION and does not survive the CT prop wire, so the menu items are built HERE
// rather than passed in — the same "build the non-serializable shape inside the story" rule the other
// client stories follow.

import { RowActionsMenu } from "@orb/client/components";
import { rowActionsName } from "@orb/client/lib";
import { Check, Icon } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";

/** The three arms, mounted together: the tap floor is a property of the AXIS, not of one call site. */
export function RowActionsTriggerSizesStory(): ReactElement {
  return (
    <div>
      <div className="group/row">
        <RowActionsMenu label={rowActionsName("icon")} triggerSize="icon">
          <MenuItem>
            <Icon icon={Check} size="sm" />
            Apply
          </MenuItem>
        </RowActionsMenu>
      </div>
      <div className="group/row">
        <RowActionsMenu label={rowActionsName("sm")} triggerSize="sm">
          <MenuItem>
            <Icon icon={Check} size="sm" />
            Apply
          </MenuItem>
        </RowActionsMenu>
      </div>
      <div className="group/row">
        <RowActionsMenu label={rowActionsName("inline")} triggerSize="inline">
          <MenuItem>
            <Icon icon={Check} size="sm" />
            Apply
          </MenuItem>
        </RowActionsMenu>
      </div>
    </div>
  );
}
