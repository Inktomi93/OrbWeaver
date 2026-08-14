// verb: updateEntry — patch an entry (whitelisted fields; `undefined` skips, `null` clears). Ownership
// folds into the WHERE via the owned-book `inArray` subquery — NEVER a bare `eq(id)`, which would allow
// a cross-tenant write. The audit logs field NAMES only (content can be 100KB of RP, never the values).
// `wiEntryScopeChanged` fans out only when a scope-affecting field (keys/enabled/metadata) changed —
// title/description/content/priority/ignoreBudget-only edits emit nothing.

import type { EntryMetadata } from "@orb/contracts/world-info";
import { entryMetadataSchema } from "@orb/contracts/world-info";
import { worldBooks, worldEntries } from "@orb/db";
import { stripUndefined } from "@orb/kit/objects";
import { resolveEntryScope } from "@orb/kit/world-info";
import { and, eq, inArray } from "drizzle-orm";
import type { WorldInfoContext } from "../../context.ts";
import { WorldInfoNotFoundError } from "../../contract/errors.ts";
import type { UpdateEntryParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { listChatIdsForBook, loadOwnedEntry, toEntryView } from "../../persistence/queries.ts";

const SCOPE_AFFECTING_FIELDS = ["keys", "enabled", "metadata"] as const;

export function createUpdate(ctx: WorldInfoContext): WorldInfoService["updateEntry"] {
  return async ({ principal, entryId, input }: UpdateEntryParams) => {
    const ownerId = principal.userId;
    let metadata: EntryMetadata | null | undefined;
    if (input.metadata === undefined) {
      metadata = undefined;
    } else if (input.metadata === null) {
      metadata = null;
    } else {
      metadata = entryMetadataSchema.parse(input.metadata);
    }
    const edits = stripUndefined({
      title: input.title,
      description: input.description,
      content: input.content,
      keys: input.keys,
      enabled: input.enabled,
      priority: input.priority,
      ignoreBudget: input.ignoreBudget,
      metadata,
    });

    if (Object.keys(edits).length === 0) {
      const row = await loadOwnedEntry(ctx.db, ownerId, entryId);
      if (row === undefined) {
        throw new WorldInfoNotFoundError("world_entry", entryId);
      }
      return toEntryView(row);
    }

    const ownedBooks = ctx.db.select({ id: worldBooks.id }).from(worldBooks).where(eq(worldBooks.ownerId, ownerId));
    const at = ctx.now();
    const rows = await ctx.db
      .update(worldEntries)
      .set({ ...edits, updatedAt: at })
      .where(and(eq(worldEntries.id, entryId), inArray(worldEntries.worldBookId, ownedBooks)))
      .returning();
    const updated = rows[0];
    if (updated === undefined) {
      throw new WorldInfoNotFoundError("world_entry", entryId);
    }

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.updateEntry",
        entityType: "world_entry",
        entityId: entryId,
        metadata: { fields: Object.keys(edits) },
      },
      at,
    );

    const scopeChanged = SCOPE_AFFECTING_FIELDS.some((field) => field in edits);
    if (scopeChanged) {
      const scope = resolveEntryScope(updated.metadata, (updated.keys?.length ?? 0) > 0);
      const chatIds = await listChatIdsForBook(ctx.db, updated.worldBookId);
      for (const chatId of chatIds) {
        // biome-ignore lint/performance/noAwaitInLoops: the chat bus assigns a monotonic seq per emit — fan-out emits are sequential (create.ts precedent).
        await ctx.emitWiEvent({
          type: "wiEntryScopeChanged",
          chatId,
          surface: "chat",
          entryId,
          scope,
        });
      }
    }

    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId: updated.worldBookId });
    return toEntryView(updated);
  };
}
