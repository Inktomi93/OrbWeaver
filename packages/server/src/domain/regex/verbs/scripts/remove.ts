// verb: removeScript — delete an owned script. The DB CASCADE clears every junction row (global / character
// / preset / chat), so a deleted script cannot leave a dangling attachment anywhere — the whole point of the
// FK model over the old id-in-a-blob soft refs. A foreign/absent id is one answer: RegexNotFoundError.

import { regexScripts } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { RegexContext } from "../../context.ts";
import { RegexNotFoundError } from "../../contract/errors.ts";
import type { RemoveScriptParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { loadOwnedScript } from "../../persistence/queries.ts";

export function createRemove(ctx: RegexContext): RegexService["removeScript"] {
  return async ({ principal, scriptId }: RemoveScriptParams) => {
    const ownerId = principal.userId;
    const record = await loadOwnedScript(ctx.db, ownerId, scriptId);
    if (record === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    // PRE-WRITE reach capture (#1746, the entity→room bridge §3.6 residual the world-info book delete
    // established): the CASCADE below tears `chat_regex_scripts` down with the row, so a post-write reach
    // resolves ∅ and every other member of a room that attached this script keeps reading a rack that still
    // lists it. Snapshot the rooms while the junction is intact; fan the captured set after the delete.
    // Taken AFTER the ownership guard (unlike world-info, whose delete IS its guard): a NotFound never pays
    // for the reach query, and never fans.
    const fanReach = await ctx.captureRoomReachForDelete([scriptId]);
    const at = ctx.now();
    await ctx.db.delete(regexScripts).where(and(eq(regexScripts.id, scriptId), eq(regexScripts.ownerId, ownerId)));
    await ctx.audit(
      { actorUserId: ownerId, action: "regex.removeScript", entityType: "regex_script", entityId: scriptId, metadata: { name: record.name } },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
    // The ROOM plane: the owner-guarded delete above is confirmed, so the captured rooms fan for this id.
    // Live-only and past the write — it cannot fault the delete that already committed.
    fanReach([scriptId]);
    return { deleted: true };
  };
}
