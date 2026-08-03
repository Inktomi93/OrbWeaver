// verb: listGlobal — the caller's globally-attached scripts, in execution order. A read: no audit.

import type { RegexContext } from "../../context.ts";
import type { ListGlobalParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { listGlobalScripts, toRow } from "../../persistence/queries.ts";

export function createListGlobal(ctx: RegexContext): RegexService["listGlobal"] {
  return async ({ principal }: ListGlobalParams) => (await listGlobalScripts(ctx.db, principal.userId)).map(toRow);
}
