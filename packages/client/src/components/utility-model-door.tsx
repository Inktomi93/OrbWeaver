// The door to the Utility picker in Model roles: the one fix for a missing or stalled Utility model, offered by every
// surface that waits on it (`use-utility-model.ts` says when).

import { Button } from "@orb/ui/button";
import { ExternalLink, Icon } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { MODEL_ROLES_PATH, UTILITY_ROLE_DOOR } from "#lib";
import { openConfigTo } from "#state";

export function UtilityModelDoor(): ReactElement {
  return (
    <Button
      intent="ghost"
      onClick={(): void => openConfigTo(UTILITY_ROLE_DOOR.group, UTILITY_ROLE_DOOR.sub, UTILITY_ROLE_DOOR.setting)}
      size="sm"
      type="button"
    >
      {`Open ${MODEL_ROLES_PATH.leaf}`}
      <Icon icon={ExternalLink} size="xs" />
    </Button>
  );
}
