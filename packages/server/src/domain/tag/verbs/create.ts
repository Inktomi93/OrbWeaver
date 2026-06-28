// verb: createTag — mint a new owner-scoped tag. TOCTOU-safe: the `(ownerId, name)` unique index is the race
// guard — a concurrent duplicate surfaces as a constraint violation on INSERT, classified into a
// `DomainConflictError` (never a phantom pre-SELECT). The id is the injected `newTagId` (determinism seam).

import { isConstraintViolation, tags } from "@orb/db";
import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import type { CreateTagParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { toTagView } from "../persistence/queries";

export function createCreate(ctx: TagContext): TagService["createTag"] {
  return async (params: CreateTagParams) => {
    const ownerId = params.principal.userId;
    const { input } = params;
    try {
      const inserted = await ctx.db
        .insert(tags)
        .values({
          id: ctx.newTagId(),
          ownerId,
          name: input.name,
          color: input.color ?? null,
          source: input.source ?? null,
        })
        .returning();
      const row = inserted[0];
      if (row === undefined) {
        throw new DomainOperationError("tag_insert_failed", "tag insert returned no row");
      }
      return toTagView(row);
    } catch (err) {
      if (isConstraintViolation(err)?.kind === "unique") {
        const dup = new DomainConflictError(`a tag named "${input.name}" already exists`);
        dup.cause = err;
        throw dup;
      }
      throw err;
    }
  };
}
