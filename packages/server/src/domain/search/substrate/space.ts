// The retrieval-side SPACE read: the `(model[@dtype])` space an owner's `embed` / `imageEmbed` binding
// resolves to right now (`RoleClients.resolved(task)`, inference program §7.5-1b). A retrieval over an owner
// with NO binding for the task is `SearchError(SEARCH_NO_SPACE)` — the composer's "no connection" refusal,
// never a query embedded in nobody's space.
//
// THE TAG IS `embedSpaceOf`, NOT `resolved.model` (§10-2), and it must stay byte-identical to the tag
// `embeddings.store` wrote: `nearest.ts` filters `model = <this string>`, so a bare model id here answers
// EMPTY against a corpus stored under `<model>@<dtype>` — no error, no log, forever.

import { embedDtypeOf, embedSpaceOf } from "@orb/contracts/inference";
import type { RoleClients } from "@orb/contracts/role-clients";
import { SEARCH_NO_SPACE, SearchError } from "../contract/errors.ts";

export async function requireSpaceModel(rc: RoleClients, task: "embed" | "imageEmbed"): Promise<string> {
  const resolved = await rc.resolved(task);
  if (resolved === null) {
    throw new SearchError(SEARCH_NO_SPACE, `no ${task} connection is bound for this user — bind one in Connections`);
  }
  return embedSpaceOf(resolved.model, embedDtypeOf(resolved.capability));
}
