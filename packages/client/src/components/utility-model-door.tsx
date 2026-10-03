// The doors to a role's picker in Model roles: the one fix for a missing or stalled Utility or Rerank model, offered by
// every surface that waits on it (`use-utility-model.ts` says when).

import { Button } from "@orb/ui/button";
import { ExternalLink, Icon } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { MODEL_ROLES_PATH, RERANK_ROLE_DOOR, UTILITY_ROLE_DOOR } from "#lib";
import { openConfigTo } from "#state";

function RoleModelDoor({ door }: { readonly door: typeof UTILITY_ROLE_DOOR | typeof RERANK_ROLE_DOOR }): ReactElement {
  return (
    <Button intent="ghost" onClick={(): void => openConfigTo(door.group, door.sub, door.setting)} size="sm" type="button">
      {`Open ${MODEL_ROLES_PATH.leaf}`}
      <Icon icon={ExternalLink} size="xs" />
    </Button>
  );
}

export function UtilityModelDoor(): ReactElement {
  return <RoleModelDoor door={UTILITY_ROLE_DOOR} />;
}

export function RerankModelDoor(): ReactElement {
  return <RoleModelDoor door={RERANK_ROLE_DOOR} />;
}
