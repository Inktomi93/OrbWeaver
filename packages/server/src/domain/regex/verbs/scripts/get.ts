// verb: getScript — one owned script. A read: no audit, no emit. A foreign/absent id is one answer.

import type { RegexContext } from "../../context.ts";
import { RegexNotFoundError } from "../../contract/errors.ts";
import type { GetScriptParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { loadOwnedScript, toRow } from "../../persistence/queries.ts";

export function createGet(ctx: RegexContext): RegexService["getScript"] {
  return async ({ principal, scriptId }: GetScriptParams) => {
    const record = await loadOwnedScript(ctx.db, principal.userId, scriptId);
    if (record === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    return toRow(record);
  };
}
