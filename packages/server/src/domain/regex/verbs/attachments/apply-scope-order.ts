// verb: applyScopeOrder — rewrite ONE scope's execution order. Position 0 runs FIRST: the resolver hands
// `executeRegexScripts` its list in `position` order and the executor applies it in order, so this verb is
// how a user says "strip the tags BEFORE the rename runs". ONE verb for all four scopes because the
// operation is identical (only the junction table differs); AUTHORITY is not — global/character/preset gate
// on ownership, chat gates on `requireChatHost` (a room-wide transform order is host state, D18).
//
// Ownership shapes differ by arm. The character/preset/chat arms gate the SCOPE (ensure*Owned /
// requireChatHost) then write `WHERE (scopeId AND scriptId)`: a foreign or stale scriptId matches no junction
// row of the OWNED scope and is silently DROPPED, and an omitted attachment keeps its stored position (the
// `applyEntryOrder` posture). The GLOBAL tier has NO scope row — `global_regex_scripts` is keyed by the script
// id alone and its ownership IS the script's (D18-style) — so a bare `WHERE regexScriptId = id` would write
// ANY owner's row. The global arm therefore PRE-GATES ownership of every ordered id (`loadOwnedScriptsByIds`,
// the single attachGlobal/detachGlobal posture) and a foreign/absent id collapses to RegexNotFoundError BEFORE
// any write (#708) — never a silent cross-tenant reorder. A stale id the caller STILL OWNS but no longer has
// attached stays dropped (it passes the ownership pre-gate, then matches no global row).
//
// The rewrite is ONE atomic `db.batch`: a half-applied reorder would leave two attachments claiming the same
// slot.

import type { Db } from "@orb/db";
import { characterRegexScripts, chatRegexScripts, globalRegexScripts, presetRegexScripts } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { RegexScriptId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { RegexContext } from "../../context.ts";
import { RegexNotFoundError } from "../../contract/errors.ts";
import type { ApplyScopeOrderParams, RegexAttachScopeRef } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { ensureCharacterOwned, ensurePresetOwned } from "../../persistence/ownership.ts";
import { loadOwnedScriptsByIds } from "../../persistence/queries.ts";

/** The GLOBAL arm's ownership gate: every ordered id must be one the caller OWNS before any position write.
 *  `global_regex_scripts` carries no owner column (its scope is the script's), so — exactly as the single
 *  `attachGlobal`/`detachGlobal` verbs do — ownership is proven on the SCRIPT via `loadOwnedScriptsByIds`. A
 *  foreign or absent id collapses to `RegexNotFoundError` (no foreign-existence oracle: "not yours" and "no
 *  such script" are one answer), so a stranger can never reorder another owner's global tier (#708). */
async function ensureGlobalScriptsOwned(db: Db, ownerId: UserId, scriptIds: readonly RegexScriptId[]): Promise<void> {
  const owned = new Set((await loadOwnedScriptsByIds(db, ownerId, scriptIds)).map((s) => s.id));
  for (const scriptId of scriptIds) {
    if (!owned.has(scriptId)) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
  }
}

/** Per-scope: authorize the scope, then build the per-attachment position writes. Exhaustive over the ref
 *  union — a new scope is a compile error here, not a silently un-orderable junction. */
async function buildOrderWrites(ctx: RegexContext, params: ApplyScopeOrderParams): Promise<BatchStmt[]> {
  const { principal, scope, orderedScriptIds } = params;
  const ownerId = principal.userId;
  switch (scope.kind) {
    case "global": {
      await ensureGlobalScriptsOwned(ctx.db, ownerId, orderedScriptIds);
      return orderedScriptIds.map((scriptId, position) =>
        ctx.db.update(globalRegexScripts).set({ position }).where(eq(globalRegexScripts.regexScriptId, scriptId)),
      );
    }
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
    // #1733 — the CHAT arm's reorder is room state (the run order every member's turns assemble in), so it
    // fans the room plane too. The other three arms are owner-library state with no member-visible
    // projection of their own: their rooms hear it through the library-row fan when a row changes.
    if (params.scope.kind === "chat") {
      ctx.emitRoomRegexChanged(params.scope.chatId);
    }
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
