// verb: updateScript — patch an owned script. Owner-gated by `loadOwnedScript` (a foreign/absent id is one
// answer: RegexNotFoundError). The BEHAVIOR blob is rewritten as a whole from the stored body ⊕ the patch,
// so a partial patch never drops the fields it did not name; `name`/`enabled` are promoted columns and
// patch independently. Omitted ⇒ unchanged (never "clear") — the library has no nullable authored field.

import { regexScriptBehaviorSchema } from "@orb/contracts/regex";
import { regexScripts } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { RegexContext } from "../../context.ts";
import { RegexNotFoundError } from "../../contract/errors.ts";
import type { UpdateScriptParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { loadOwnedScript, toRow } from "../../persistence/queries.ts";

export function createUpdate(ctx: RegexContext): RegexService["updateScript"] {
  return async ({ principal, scriptId, input }: UpdateScriptParams) => {
    const ownerId = principal.userId;
    const record = await loadOwnedScript(ctx.db, ownerId, scriptId);
    if (record === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }

    const { name: patchName, enabled: patchEnabled, ...behaviorPatch } = input;
    const { id: _id, name: _name, enabled: _enabled, updatedAt: _updatedAt, ...currentBehavior } = toRow(record);
    // A `.partial()` patch carries EXPLICIT `undefined` for every omitted key; under
    // `exactOptionalPropertyTypes` a bare spread would therefore erase fields rather than leave them. Merge
    // only the DEFINED keys, then re-parse through the schema so the stored blob is always canonical.
    const merged: Record<string, unknown> = { ...currentBehavior };
    for (const [key, value] of Object.entries(behaviorPatch)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
    const behavior = regexScriptBehaviorSchema.parse(merged);
    const name = patchName ?? record.name;
    const enabled = patchEnabled ?? record.enabled;
    const at = ctx.now();

    await ctx.db
      .update(regexScripts)
      .set({ name, enabled, behavior, updatedAt: at })
      .where(and(eq(regexScripts.id, scriptId), eq(regexScripts.ownerId, ownerId)));

    await ctx.audit({ actorUserId: ownerId, action: "regex.updateScript", entityType: "regex_script", entityId: scriptId, metadata: { name } }, at);

    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
    // #1733's library half: a row's `name`/`enabled` is member-visible in every room whose own tier attaches
    // it (`regex.listForChat` is room-public), and the #1742 section's row switch IS this verb. Awaited so a
    // caller's own read-after-write cannot race the fan; error-isolated inside the op, never rejects.
    await ctx.fanRegexScriptRooms(scriptId);
    return { id: scriptId, name, enabled, updatedAt: at, ...behavior };
  };
}
