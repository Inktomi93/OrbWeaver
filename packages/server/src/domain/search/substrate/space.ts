// The retrieval-side SPACE read: the model an owner's `embed` / `imageEmbed` binding resolves to right now
// (`RoleClients.resolved(task)`, inference program §7.5-1b). A retrieval over an owner with NO binding for
// the task is `SearchError(SEARCH_NO_SPACE)` — the composer's "no connection" refusal, never a query embedded
// in nobody's space.

import type { RoleClients } from "@orb/contracts/role-clients";
import { SEARCH_NO_SPACE, SearchError } from "../contract/errors.ts";

export async function requireSpaceModel(rc: RoleClients, task: "embed" | "imageEmbed"): Promise<string> {
  const resolved = await rc.resolved(task);
  if (resolved === null) {
    throw new SearchError(SEARCH_NO_SPACE, `no ${task} connection is bound for this user — bind one in Connections`);
  }
  return resolved.model;
}
