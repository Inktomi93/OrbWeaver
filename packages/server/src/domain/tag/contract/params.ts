// domain/tag/contract/params — every verb's *Params, declared ONCE (§7.4). The wire INPUT shapes
// (`CreateTagInput`/`UpdateTagInput`) + the wire axes (`TagTargetType`/`TagStatus`) are the cross-boundary
// concern and live in `@orb/contracts/tag`; the verb params WRAP them with the acting
// `principal` (resolved at the entry seam — the verb gates on the principal it is handed, spine §1) and the
// branded ids. Owner scoping is `principal.userId` (§7.1) — tags are personal labels, no resource-role.

import type { Principal } from "@orb/contracts/identity";
import type {
  CreateTagInput,
  TagSource,
  TagStatus,
  TagTargetType,
  UpdateTagInput,
} from "@orb/contracts/tag";
import type { CharacterId, TagId, UserId } from "@orb/kit/ids";

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

/**
 * The internal resolve-or-create-by-name card-tag attach (the `attachCardTagByName` verb) — character's
 * injected `AttachCardTagOp` (contract/service.ts). Deliberately NOT a {@link TagActorParams}:
 * it carries the already-resolved `ownerId` directly (NOT a `principal`), because the caller
 * (`character.bulkAddCardTag`) has ALREADY owner-verified the character. A trusted SYSTEM by-owner op wired at
 * the composition root — the same "un-principal, by-id, owner already gated" posture as character's
 * `loadCardText` / `mintSyntheticGroupCharacter`.
 */
export interface AttachCardTagByNameParams {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly tagName: string;
  /**
   * The provenance stamped on the tag at FIRST create (resolve-or-create: an existing tag KEEPS its source —
   * a tag's source is set once). Default `manual` (a user-typed add stays manual). Import / a seeded card pass
   * `card` (author-shipped native tags); corpus distillation (PD-40) passes `auto`.
   */
  readonly source?: TagSource;
  /**
   * The `character_tags` junction surface. Default `accepted` (a manual add is a live tag); import / corpus
   * distillation pass `pending` to stage a suggestion awaiting the user's "Accept". A re-attach NEVER
   * downgrades an existing `accepted` row back to `pending` (the attach is `onConflictDoNothing`), so a card
   * re-import can't un-accept a tag the user already accepted.
   */
  readonly status?: TagStatus;
}
