// Every verb's *Params. Wire input shapes and axes live in `@orb/contracts/tag`; these wrap them with the
// acting `principal` and branded ids. Owner scoping is `principal.userId` — tags are personal labels.

import type { Principal } from "@orb/contracts/identity";
import type { CreateTagInput, TagSource, TagStatus, TagTargetType, UpdateTagInput } from "@orb/contracts/tag";
import type { CharacterId, TagId, UserId } from "@orb/kit/ids";

/** Common to every tag verb: the acting principal whose `userId` is the owner discriminant. */
interface TagActorParams {
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

export interface MergeTagsParams extends TagActorParams {
  /** The tag to fold away — every attachment re-points to `targetTagId`, then this row is deleted. */
  readonly sourceTagId: TagId;
  /** The tag that survives (absorbs the source's attachments). Both must be owned by `principal`; equal
   *  ids are a `DomainOperationError` (a self-merge is nonsensical, not a no-op). */
  readonly targetTagId: TagId;
}

export interface ListTagsWithUsageParams extends TagActorParams {}

/** The pending-suggestion review read. `characterId` narrows to one editor's suggestions; absent = the
 *  owner's whole pending inbox. */
export interface ListPendingSuggestionsParams extends TagActorParams {
  readonly characterId?: CharacterId;
}

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

/** The internal resolve-or-create-by-name card-tag attach. Deliberately not a {@link TagActorParams}: it
 *  carries the already-resolved `ownerId` directly, because the caller has already owner-verified the
 *  character. */
export interface AttachCardTagByNameParams {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly tagName: string;
  /** Stamped on the tag at first create only. Default `manual`; import/seeded cards pass `card`;
   *  corpus distillation passes `auto`. */
  readonly source?: TagSource;
  /** Default `accepted`; import/distillation pass `pending` to stage a suggestion. Never downgrades an
   *  already-`accepted` row. */
  readonly status?: TagStatus;
}

/** The internal resolve-by-name card-tag detach — the mirror of {@link AttachCardTagByNameParams}. No
 *  `source`/`status` — a detach only needs to name the tag and drop the junction. */
export interface DetachCardTagByNameParams {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly tagName: string;
}
