// verb: getScript — one owned script. A read: no audit, no emit. A foreign/absent id is one answer.

import type { RegexContext } from "../../context";
import { RegexNotFoundError } from "../../contract/errors";
import type { GetScriptParams } from "../../contract/params";
import type { RegexService } from "../../contract/service";
import { loadOwnedScript, toRow } from "../../persistence/queries";

export function createGet(ctx: RegexContext): RegexService["getScript"] {
  return async ({ principal, scriptId }: GetScriptParams) => {
    const record = await loadOwnedScript(ctx.db, principal.userId, scriptId);
    if (record === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    return toRow(record);
  };
}
