// verb: applyScopeOrder — rewrite ONE scope's execution order. Position 0 runs FIRST: the resolver hands
// `executeRegexScripts` its list in `position` order and the executor applies it in order, so this verb is
// how a user says "strip the tags BEFORE the rename runs". ONE verb for all four scopes because the
// operation is identical (only the junction table differs); AUTHORITY is not — global/character/preset gate
// on ownership, chat gates on `requireChatHost` (a room-wide transform order is host state, D18).
//
// Stale/foreign ids are silently DROPPED (they simply match no row), and an attachment the caller omitted
// keeps its stored position — the `applyEntryOrder` posture. The rewrite is ONE atomic `db.batch`: a
// half-applied reorder would leave two attachments claiming the same slot.

import { characterRegexScripts, chatRegexScripts, globalRegexScripts, presetRegexScripts } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import { and, eq } from "drizzle-orm";
import type { RegexContext } from "../../context";
import type { ApplyScopeOrderParams, RegexAttachScopeRef } from "../../contract/params";
import type { RegexService } from "../../contract/service";
import { ensureCharacterOwned, ensurePresetOwned } from "../../persistence/ownership";

/** Per-scope: authorize the scope, then build the per-attachment position writes. Exhaustive over the ref
 *  union — a new scope is a compile error here, not a silently un-orderable junction. */
async function buildOrderWrites(ctx: RegexContext, params: ApplyScopeOrderParams): Promise<BatchStmt[]> {
  const { principal, scope, orderedScriptIds } = params;
  const ownerId = principal.userId;
  switch (scope.kind) {
    case "global":
      return orderedScriptIds.map((scriptId, position) =>
        ctx.db.update(globalRegexScripts).set({ position }).where(eq(globalRegexScripts.regexScriptId, scriptId)),
      );
    case "character": {
      await ensureCharacterOwned(ctx.db, ownerId, scope.characterId);
      return orderedScriptIds.map((scriptId, position) =>
        ctx.db
          .update(characterRegexScripts)
          .set({ position })
          .where(and(eq(characterRegexScripts.characterId, scope.characterId), eq(characterRegexScripts.regexScriptId, scriptId))),
      );
    }
    case "preset": {
      await ensurePresetOwned(ctx.db, ownerId, scope.presetId);
      return orderedScriptIds.map((scriptId, position) =>
        ctx.db
          .update(presetRegexScripts)
          .set({ position })
          .where(and(eq(presetRegexScripts.presetId, scope.presetId), eq(presetRegexScripts.regexScriptId, scriptId))),
      );
    }
    case "chat": {
      await ctx.requireChatHost(principal, scope.chatId);
      return orderedScriptIds.map((scriptId, position) =>
        ctx.db
          .update(chatRegexScripts)
          .set({ position })
          .where(and(eq(chatRegexScripts.chatId, scope.chatId), eq(chatRegexScripts.regexScriptId, scriptId))),
      );
    }
    default:
      return assertNever(scope);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled regex attach scope: ${JSON.stringify(value)}`);
}

export function createApplyScopeOrder(ctx: RegexContext): RegexService["applyScopeOrder"] {
  return async (params: ApplyScopeOrderParams) => {
    const writes = await buildOrderWrites(ctx, params);
    if (writes.length === 0) {
      return { reordered: 0 };
    }
    const results = await ctx.db.batch(batchMany(writes));
    const reordered = results.reduce((sum: number, r) => sum + r.rowsAffected, 0);
    const at = ctx.now();
    await ctx.audit(
      {
        actorUserId: params.principal.userId,
        action: "regex.applyScopeOrder",
        entityType: "regex_script",
        entityId: scopeEntityId(params.scope),
        metadata: { scope: params.scope.kind, reordered },
      },
      at,
    );
    ctx.emitUserEvent(params.principal.userId, { type: "regexChanged" });
    return { reordered };
  };
}

/** The audit's soft-ref subject: the SCOPE the order belongs to (a reorder is not about one script). */
function scopeEntityId(scope: RegexAttachScopeRef): string {
  switch (scope.kind) {
    case "global":
      return "global";
    case "character":
      return scope.characterId;
    case "preset":
      return scope.presetId;
    case "chat":
      return scope.chatId;
    default:
      return assertNever(scope);
  }
}
