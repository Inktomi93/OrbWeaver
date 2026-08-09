// verb: createScript — mint a new library script owned by the caller. Ownership scopes off
// `principal.userId` (the source of truth — never a `users` read). The injected `newScriptId`/`now` keep it
// deterministic (no ambient `mintTypeId()`/`Date.now()`). Returns the row view built from the inserted
// values (a script has no joined data, so no re-read is needed).

import { regexScripts } from "@orb/db";
import type { RegexContext } from "../../context.ts";
import type { CreateScriptParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";

export function createCreate(ctx: RegexContext): RegexService["createScript"] {
  return async ({ principal, input }: CreateScriptParams) => {
    const ownerId = principal.userId;
    const at = ctx.now();
    const scriptId = ctx.newScriptId();
    const { name, enabled, ...behavior } = input;

    await ctx.db.insert(regexScripts).values({ id: scriptId, ownerId, name, enabled, behavior, createdAt: at, updatedAt: at });

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "regex.createScript",
        entityType: "regex_script",
        entityId: scriptId,
        metadata: { name },
      },
      at,
    );

    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
    return { id: scriptId, name, enabled, updatedAt: at, ...behavior };
  };
}
