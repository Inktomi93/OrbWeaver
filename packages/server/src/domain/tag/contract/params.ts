// domain/tag/contract/params — every verb's *Params, declared ONCE (§7.4). The wire INPUT shapes
// (`CreateTagInput`/`UpdateTagInput`) + the wire axes (`TagTargetType`/`TagStatus`) are the cross-boundary
// concern and live in `@orb/contracts/tag` (tag.md Movement); the verb params WRAP them with the acting
// `principal` (resolved at the entry seam — the verb gates on the principal it is handed, spine §1) and the
// branded ids. Owner scoping is `principal.userId` (§7.1) — tags are personal labels, no resource-role.

import type { Principal } from "@orb/contracts/identity";
import type { CreateTagInput, TagStatus, TagTargetType, UpdateTagInput } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";

/** Common to every tag verb: the acting principal whose `userId` is the owner discriminant. */
export interface TagActorParams {
  readonly principal: Principal;
}

export interface CreateTagParams extends TagActorParams {
  readonly input: CreateTagInput;
}

export interface GetTagParams extends TagActorParams {
  readonly tagId: TagId;
}

export interface ListTagsParams extends TagActorParams {}

export interface UpdateTagParams extends TagActorParams {
  readonly tagId: TagId;
  readonly patch: UpdateTagInput;
}

export interface RemoveTagParams extends TagActorParams {
  readonly tagId: TagId;
}

export interface ListTagsWithUsageParams extends TagActorParams {}

export interface PruneUnusedTagsParams extends TagActorParams {}

export interface SetTagOrderParams extends TagActorParams {
  /** The tags in their new manual order; position i becomes `sortOrder = i`. Owner-scoped (a foreign id is
   *  silently skipped by the owner predicate). The router enforces `min(1)`; the verb guards the empty case. */
  readonly orderedIds: readonly TagId[];
}

export interface AttachTagParams extends TagActorParams {
  readonly tagId: TagId;
  readonly targetType: TagTargetType;
  /** The target row's id (plain string on the wire; branded per `targetType` at the junction dispatch). */
  readonly targetId: string;
  /** The proposed/accepted surface — honored ONLY for `targetType: "character"` (the four other junctions
   *  have no status column). Default `accepted` (a manual attach is a live tag); import / corpus distillation
   *  pass `pending` to stage a suggestion. Re-attaching with `accepted` flips a pending row (the "Accept"). */
  readonly status?: TagStatus;
}

export interface DetachTagParams extends TagActorParams {
  readonly tagId: TagId;
  readonly targetType: TagTargetType;
  readonly targetId: string;
}

export interface BulkAttachTagParams extends TagActorParams {
  /** Attach many tags to ONE target in a single round-trip (the "Promote" path: create-then-bulk-attach). */
  readonly tagIds: readonly TagId[];
  readonly targetType: TagTargetType;
  readonly targetId: string;
  /** As {@link AttachTagParams.status} — honored only for `targetType: "character"`; default `accepted`. */
  readonly status?: TagStatus;
}
