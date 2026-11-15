// verb: updateScript — patch an owned script. Owner-gated by `requireOwnedScript` (a foreign/absent id is one
// answer: RegexNotFoundError). The BEHAVIOR blob is rewritten as a whole from the stored body ⊕ the patch,
// so a partial patch never drops the fields it did not name; `name`/`enabled` are promoted columns and
// patch independently. Omitted ⇒ unchanged; `null` on depth or authors clears it, since each one's every-position or
// every-author spelling is the absent field. The shared ephemeral-scope rule also drops both: a body whose passes
// leave depth or authors nothing to apply to (`substrate/ephemeral-scope`).

import { regexScriptBehaviorSchema, regexScriptBehaviorWriteSchema } from "@orb/contracts/regex";
import { regexScripts } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import { and, eq } from "drizzle-orm";
import type { UpdateScriptParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { requireOwnedScript } from "#src/domain/regex/persistence/ownership.ts";
import { toRow } from "#src/domain/regex/persistence/queries.ts";
import { settleEphemeralScope } from "#src/domain/regex/substrate/ephemeral-scope.ts";
import { requireFindAdmitted } from "#src/domain/regex/substrate/find-door.ts";

/** The code a patch carries when the merged script breaks a pairing rule (a save pass beside an ephemeral one, a
 *  ceiling shallower than its floor). */
const REGEX_SCRIPT_INCOHERENT = "regex_script_incoherent";

export function createUpdate(ctx: RegexContext): RegexService["updateScript"] {
  return async ({ principal, scriptId, input }: UpdateScriptParams) => {
    const ownerId = principal.userId;
    const record = await requireOwnedScript(ctx.db, ownerId, scriptId);

    const { name: patchName, enabled: patchEnabled, ...behaviorPatch } = input;
    const { id: _id, name: _name, enabled: _enabled, updatedAt: _updatedAt, ...currentBehavior } = toRow(record);
    // A `.partial()` patch carries EXPLICIT `undefined` for every omitted key; under
    // `exactOptionalPropertyTypes` a bare spread would therefore erase fields rather than leave them. Merge
    // only the DEFINED keys, drop each key the patch clears with `null`, then re-parse through the schema so the
    // stored blob is always canonical.
    const patched: Record<string, unknown> = {
      ...currentBehavior,
      ...Object.fromEntries(Object.entries(behaviorPatch).filter(([, value]) => value !== undefined)),
    };
    const merged = Object.fromEntries(Object.entries(patched).filter(([, value]) => value !== null));
    // A move to the save pass leaves depth and an author scope nothing to apply to, so they go; then the merged
    // body must pass the pairing rules a create passes at the wire.
    const settled = regexScriptBehaviorWriteSchema.safeParse(settleEphemeralScope(regexScriptBehaviorSchema.parse(merged)).behavior);
    if (!settled.success) {
      throw new DomainOperationError(REGEX_SCRIPT_INCOHERENT, settled.error.issues.map(({ message }) => message).join("; "));
    }
    const behavior = settled.data;
    const name = patchName ?? record.name;
    if (behavior.findRegex !== currentBehavior.findRegex || behavior.substituteRegex !== currentBehavior.substituteRegex) {
      await requireFindAdmitted(ctx.probeFindCompiles, { name, ...behavior });
    }
    const enabled = patchEnabled ?? record.enabled;
    const at = ctx.now();

    await ctx.db
      .update(regexScripts)
      .set({ name, enabled, behavior, updatedAt: at })
      .where(and(eq(regexScripts.id, scriptId), eq(regexScripts.ownerId, ownerId)));

    await ctx.audit({ actorUserId: ownerId, action: "regex.updateScript", entityType: "regex_script", entityId: scriptId, metadata: { name } }, at);

    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
    // The library half of the room fan: a row's `name`/`enabled` is member-visible in every room whose own tier attaches
    // it (`regex.listForChat` is room-public), and the Regex section's row switch IS this verb. Awaited so a
    // caller's own read-after-write cannot race the fan; error-isolated inside the op, never rejects.
    await ctx.fanRegexScriptRooms(scriptId);
    return { id: scriptId, name, enabled, updatedAt: at, ...behavior };
  };
}
