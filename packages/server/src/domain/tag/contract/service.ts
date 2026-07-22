// The typed API surface: RequireParticipant (the DI port into domain/chat's membership gate), TagContext
// (the DI bundle), and TagService (the verb interface). Tag verbs gate on owner-equality scoping; the
// chat-tag junction additionally routes through the injected `requireParticipant` since chats have no owner.

import type { Principal } from "@orb/contracts/identity";
import type { TagSuggestionView, TagView, TagWithUsage } from "@orb/contracts/tag";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { ChatId, TagId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  AttachCardTagByNameParams,
  AttachTagParams,
  BulkAttachTagParams,
  CreateTagParams,
  DetachCardTagByNameParams,
  DetachTagParams,
  ListPendingSuggestionsParams,
  ListTagsParams,
  ListTagsWithUsageParams,
  MergeTagsParams,
  PruneUnusedTagsParams,
  RemoveTagParams,
  SetTagOrderParams,
  UpdateTagParams,
} from "./params";
import type { PruneUnusedResult } from "./results";

/** The chat-tag membership gate injected from `domain/chat`. Throws for a non-member, resolves for a
 *  member. Wired at the composition root with chat's real guard; never sideways-imported. */
export type RequireParticipant = (principal: Principal, chatId: ChatId) => Promise<void>;

/** The DI bundle the tag verbs close over. Tag rows have no clock dependency — `createdAt` is a SQL default
 *  and `audit` takes no `at` param, keeping the verbs clockless. */
export interface TagContext {
  readonly db: Db;
  readonly newTagId: () => TagId;
  readonly requireParticipant: RequireParticipant;
  readonly audit: (entry: AuditEntry) => Promise<void>;
  /** Fires `tagsChanged` after every tag mutation's durable write, fire-and-forget. */
  readonly emitUserEvent: EmitUserEvent;
}

/** The tag taxonomy surface. Every verb is owner-scoped on `params.principal.userId`; the junction trio
 *  additionally gates the target (target-derived ownership, or injected membership for chat). */
export interface TagService {
  readonly createTag: (params: CreateTagParams) => Promise<TagView>;
  readonly listTags: (params: ListTagsParams) => Promise<TagView[]>;
  readonly updateTag: (params: UpdateTagParams) => Promise<TagView>;
  readonly removeTag: (params: RemoveTagParams) => Promise<void>;
  /** Fold `sourceTagId` into `targetTagId`: re-point every attachment across all five junctions to the
   *  target (deduping — the strongest status survives), then delete the source tag. One atomic batch. A
   *  self-merge (equal ids) is a `DomainOperationError`. */
  readonly mergeTags: (params: MergeTagsParams) => Promise<void>;
  readonly listTagsWithUsage: (params: ListTagsWithUsageParams) => Promise<TagWithUsage[]>;
  /** Enumerate the owner's staged (`status:'pending'`) character-tag suggestions — the Accept/Reject review
   *  queue. `characterId` narrows to one editor's suggestions; absent = the whole pending inbox. Read-only:
   *  Accept = `attachTag(status:'accepted')`, Reject = `detachTag`. */
  readonly listPendingSuggestions: (params: ListPendingSuggestionsParams) => Promise<TagSuggestionView[]>;
  readonly pruneUnusedTags: (params: PruneUnusedTagsParams) => Promise<PruneUnusedResult>;
  readonly setTagOrder: (params: SetTagOrderParams) => Promise<void>;
  readonly attachTag: (params: AttachTagParams) => Promise<void>;
  readonly detachTag: (params: DetachTagParams) => Promise<void>;
  readonly bulkAttachTag: (params: BulkAttachTagParams) => Promise<void>;
  /** Resolve-or-create the owner's tag by name (race-safe), then attach it to the character, idempotently.
   *  `source`/`status` default to `manual`/`accepted`; import/seeded cards pass `card`/`pending` to stage a
   *  suggestion. Not principal-gated — trusts the caller-resolved `ownerId`. */
  readonly attachCardTagByName: (params: AttachCardTagByNameParams) => Promise<boolean>;
  /** Resolve the owner's tag by name (case-insensitive, no create) and detach it from the character.
   *  Idempotent on absent. The tag row itself survives a detach. Not principal-gated. */
  readonly detachCardTagByName: (params: DetachCardTagByNameParams) => Promise<boolean>;
}
