// verb: createEntry — mint an entry in an owned book (book ownership gated first; entries carry no owner of
// their own — they inherit via the book, D23). The injected `newEntryId`/`now` keep it deterministic. The
// `metadata` write-record is coerced through `entryMetadataSchema` at the WRITE seam (the input arrives as a
// loose record validated at transport; the column is typed `EntryMetadata`) so a non-transport caller can't
// smuggle an unvalidated blob past the type — `null` clears. Column defaults are applied explicitly so the
// returned view matches the stored row without a re-read.

import { entryMetadataSchema } from "@orb/contracts/world-info";
import { worldEntries } from "@orb/db";
import { WorldInfoNotFoundError } from "../../contract/errors";
import type { CreateEntryParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";
import { loadOwnedBook } from "../../persistence/queries";

export function createCreate(ctx: WorldInfoContext): WorldInfoService["createEntry"] {
  return async ({ principal, bookId, input }: CreateEntryParams) => {
    const ownerId = principal.userId;
    const book = await loadOwnedBook(ctx.db, ownerId, bookId);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }

    const at = ctx.now();
    const entryId = ctx.newEntryId();
    const description = input.description ?? null;
    const keys = input.keys ?? null;
    const enabled = input.enabled ?? true;
    const priority = input.priority ?? 0;
    const ignoreBudget = input.ignoreBudget ?? false;
    const rawMetadata = input.metadata ?? null;
    const metadata = rawMetadata === null ? null : entryMetadataSchema.parse(rawMetadata);

    await ctx.db.insert(worldEntries).values({
      id: entryId,
      worldBookId: bookId,
      title: input.title,
      description,
      content: input.content,
      keys,
      enabled,
      priority,
      ignoreBudget,
      metadata,
      createdAt: at,
    });

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.createEntry",
        entityType: "world_entry",
        entityId: entryId,
        metadata: { bookId, title: input.title },
      },
      at,
    );

    return {
      id: entryId,
      worldBookId: bookId,
      title: input.title,
      description,
      content: input.content,
      keys,
      enabled,
      priority,
      ignoreBudget,
      metadata,
    };
  };
}
