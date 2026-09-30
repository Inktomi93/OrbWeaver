// Reach returns only destinations authorized by their owning domains.
import { TAG_REACH_PREVIEW_LIMIT } from "@orb/contracts/tag";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import { TagNotFoundError } from "../contract/errors.ts";
import type { TagContext, TagService } from "../contract/service.ts";
import { listAdoptedTargetRefs, loadOwnedTag } from "../persistence/queries.ts";

export function createListAttachedEntities(ctx: TagContext): TagService["listAttachedEntities"] {
  return async ({ principal, tagId, targetType }) => {
    if ((await loadOwnedTag(ctx.db, tagId, principal.userId)) === undefined) {
      throw new TagNotFoundError(tagId);
    }
    const refs = await listAdoptedTargetRefs(ctx.db, principal.userId, tagId, targetType);
    const entities = await Promise.all(
      refs.slice(0, TAG_REACH_PREVIEW_LIMIT).map(async (ref) => {
        try {
          return await ctx.readAttachedEntity(principal, ref);
        } catch (error) {
          // Membership or ownership may change while the label survives; inaccessible targets have no door.
          if (error instanceof DomainNotFoundError || error instanceof DomainForbiddenError) {
            return null;
          }
          throw error;
        }
      }),
    );
    return { entities: entities.filter((entity) => entity !== null), hasMore: refs.length > TAG_REACH_PREVIEW_LIMIT };
  };
}
