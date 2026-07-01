// domain/tag/contract/service — the typed API surface (read THIS to know everything the tag domain does).
// Holds:
//   • RequireParticipant  the dependency-inversion port the tag domain needs from `domain/chat` (the D30
//                         chat-tag membership gate). Declared HERE as the slice tag consumes; satisfied
//                         structurally at the composition root by chat's real participant guard — tag
//                         sideways-imports NOTHING (domain-no-cross-feature; the type-only edge is sanctioned).
//   • TagContext          the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4)
//   • TagService          the 11-verb authoritative interface (the front door re-exports the type)
// Tag verbs gate on the `Principal` they are handed — owner-equality scoping (`WHERE ownerId = principal.userId`)
// for the four target-derived junctions + the tag namespace; the chat-tag junction (D30) additionally routes
// through the injected `requireParticipant` (its target `chats` has no owner — D18). No admin/owner role gate:
// tags are personal labels (tag.md §7.1).

import type { Principal } from "@orb/contracts/identity";
import type { TagView, TagWithUsage } from "@orb/contracts/tag";
import type { Db } from "@orb/db";
import type { ChatId, TagId } from "@orb/kit/ids";
import type {
  AttachCardTagByNameParams,
  AttachTagParams,
  BulkAttachTagParams,
  CreateTagParams,
  DetachTagParams,
  GetTagParams,
  ListTagsParams,
  ListTagsWithUsageParams,
  PruneUnusedTagsParams,
  RemoveTagParams,
  SetTagOrderParams,
  UpdateTagParams,
} from "./params";
import type { PruneUnusedResult } from "./results";

/**
 * The D30 chat-tag membership gate — the cross-feature op the tag domain injects from `domain/chat`. A
 * `chat_tags` row is a PER-USER overlay on a membership-scoped chat (no `chats.ownerId`, D18), so attach /
 * detach must verify the principal is a participant of the chat. THROWS (rejects) for a non-member; resolves
 * for a member. Wired at the composition root with chat's real guard; never sideways-imported.
 *
 * The port TYPE is homed here (the injecting domain declares the shape). The `entry` root injects chat's real
 * `requireParticipant` into `createTagService`.
 */
export type RequireParticipant = (principal: Principal, chatId: ChatId) => Promise<void>;

/**
 * The DI bundle the tag verbs close over (wired at `service.ts` / the entry root). `newTagId` is the
 * injected id seam (no ambient id — testing §3); `requireParticipant` is chat's membership gate (the only
 * cross-feature dep). `db` is the persistence handle. NO clock: tag rows born-stamp `createdAt` via the
 * schema's SQL default (no JS wall-clock), and no tag view surfaces a timestamp.
 */
export interface TagContext {
  readonly db: Db;
  readonly newTagId: () => TagId;
  readonly requireParticipant: RequireParticipant;
}

/**
 * The tag taxonomy surface (tag.md). 11 verbs: 5 CRUD + 3 management + the junction trio. Every verb is
 * owner-scoped on `params.principal.userId`; the junction trio additionally gates the TARGET (target-derived
 * ownership for character/worldBook/persona/preset; injected membership for chat — D30).
 */
export interface TagService {
  readonly createTag: (params: CreateTagParams) => Promise<TagView>;
  readonly getTag: (params: GetTagParams) => Promise<TagView>;
  readonly listTags: (params: ListTagsParams) => Promise<TagView[]>;
  readonly updateTag: (params: UpdateTagParams) => Promise<TagView>;
  readonly removeTag: (params: RemoveTagParams) => Promise<void>;
  readonly listTagsWithUsage: (params: ListTagsWithUsageParams) => Promise<TagWithUsage[]>;
  readonly pruneUnusedTags: (params: PruneUnusedTagsParams) => Promise<PruneUnusedResult>;
  readonly setTagOrder: (params: SetTagOrderParams) => Promise<void>;
  readonly attachTag: (params: AttachTagParams) => Promise<void>;
  readonly detachTag: (params: DetachTagParams) => Promise<void>;
  readonly bulkAttachTag: (params: BulkAttachTagParams) => Promise<void>;

  /**
   * Resolve-or-create the owner's tag BY NAME (race-safe on the `(ownerId, name)` unique), then attach it to
   * the character, idempotently. The ONE by-name attach home shared by character's `bulkAddCardTag`, import's
   * card-tag carry, and the seeded default cards (no parallel flow). `source`/`status` default to
   * `manual`/`accepted` (the unchanged manual-add path); import / a seeded card pass `card`/`pending` to stage
   * a suggestion. `source` is stamped only on first create; a re-attach never downgrades `accepted`→`pending`
   * (`onConflictDoNothing`). Returns `true` if NEWLY attached, `false` if the character already carried it.
   * NOT principal-gated — it trusts the caller-resolved `ownerId` (the caller already owner-verified the row).
   */
  readonly attachCardTagByName: (params: AttachCardTagByNameParams) => Promise<boolean>;
}
