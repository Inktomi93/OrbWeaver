// domain/character/contract/params — every verb's *Params, declared ONCE. Every USER-facing verb carries
// the resolved principal; ownership scopes off principal.userId, never a users read. The synthetic-identity
// ops (Mint/Find/FindByImportHash/FindByHandle) are internal and act on an already-resolved ownerId.

import type { CharacterListCursor, CharacterListSort, CreateCharacterInput, UpdateCharacterInput } from "@orb/contracts/character";

import type { Principal } from "@orb/contracts/identity";
import type { GreetingTransformId } from "@orb/contracts/preset";
import type { CharacterHandle, CharacterId, CharacterSnapshotId, ChatId, TagId, UserId } from "@orb/kit/ids";

export type { CharacterListCursor, CharacterListSort } from "@orb/contracts/character";

interface CharacterActorParams {
  readonly principal: Principal;
}

/** Import provenance stamp for `create`; importHash is the whole-file sha-256 dedup key, distinct from
 *  contentHash. Omit for app-authored cards. */
export interface CharacterImportProvenance {
  readonly importedFrom: string | null;
  readonly importHash: string;
}

export interface CreateCharacterParams extends CharacterActorParams {
  readonly input: CreateCharacterInput;
  readonly provenance?: CharacterImportProvenance;
}

export interface GetCharacterParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

/** The library list's read, with EVERY lens the toolbar offers resolved server-side (owner ruling
 *  2026-08-13, the `listChats` precedent): a keyset page can only ever search/filter what it has fetched, so
 *  a client-side predicate over the loaded window is a claim the surface has no standing to make.
 *
 *  The two boolean axes are TRI-STATE — `undefined` is UNFILTERED, not `false`. That is what keeps the
 *  lookup-map callers (portrait maps, pickers, the agent nav) whole while the library's own chips narrow:
 *  omitting `archived` still serves archived rows, and only the toggle's OFF state sends `archived: false`. */
export interface ListCharactersParams extends CharacterActorParams {
  readonly sort?: CharacterListSort;
  /** Cursor's sort discriminant MUST match `sort`; a mismatch is rejected rather than applying the wrong keyset. */
  readonly cursor?: CharacterListCursor;
  readonly limit?: number;
  /** SERVER-SIDE search over the WHOLE library: the name, the handle, the distilled elevator pitch, or an
   *  ACCEPTED tag's name — every string the row itself renders. Blank/whitespace is the unsearched list. */
  readonly search?: string;
  /** `true` = favorites only · `false` = unstarred only · omitted = both. */
  readonly starred?: boolean;
  /** `false` = the library's Archived-toggle-OFF state · `true` = archived only · omitted = both. */
  readonly archived?: boolean;
  /** AND-semantics: a row must carry EVERY one of these accepted tags (the include chips). */
  readonly includeTagIds?: readonly TagId[];
  /** AND-semantics: a row must carry NONE of these accepted tags (the exclude chips). */
  readonly excludeTagIds?: readonly TagId[];
}

export interface UpdateCharacterParams extends CharacterActorParams {
  readonly characterId: CharacterId;
  readonly input: UpdateCharacterInput;
}

export interface RemoveCharacterParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

export interface DuplicateCharacterParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

export interface BulkRemoveParams extends CharacterActorParams {
  readonly characterIds: readonly CharacterId[];
}

export interface BulkArchiveParams extends CharacterActorParams {
  readonly characterIds: readonly CharacterId[];
  readonly archived: boolean;
}

export interface BulkAddCardTagParams extends CharacterActorParams {
  readonly tagName: string;
  readonly characterIds: readonly CharacterId[];
}

export interface BulkRemoveCardTagParams extends CharacterActorParams {
  readonly tagName: string;
  readonly characterIds: readonly CharacterId[];
}

export interface SnapshotParams extends CharacterActorParams {
  readonly characterId: CharacterId;
  readonly label?: string | null;
}

export interface ListSnapshotsParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

/** `getSnapshot` — one snapshot's blob for compare/inspect (the refinery Versions walk). Both ids ride
 *  so the owner belt and the parent scope collapse together (a foreign pair is one NOT_FOUND). */
export interface GetSnapshotParams extends CharacterActorParams {
  readonly characterId: CharacterId;
  readonly snapshotId: CharacterSnapshotId;
}

export interface RestoreParams extends CharacterActorParams {
  readonly characterId: CharacterId;
  readonly snapshotId: CharacterSnapshotId;
}

export interface GetCardParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

/** Greeting studio (audit §3) — the guided-action machinery pointed at a BASE greeting, owner-gated. Both
 *  verbs RETURN text and NEVER write; the client appends the accepted result via `character.update`.
 *
 *  The steer is composed HERE, not in the browser (the templating fork's ARM B — owner 2026-08-09): the wire
 *  carries the picked transform KINDS plus the host's own free text, and the verb resolves each kind's
 *  `preset.greetingTransform.*` prose slot against the caller's preset overrides before joining them with
 *  `composeRewriteSteer` — the ONE steer that becomes `{{input}}` inside the resolved preset template.
 *  `greeting` is the current greeting TEXT for a rewrite (the `{{base}}` token); a new-greeting request omits
 *  it. Template + prose both come from the caller's preset (resolved at compose via the injected op). */
export interface RewriteGreetingParams extends CharacterActorParams {
  readonly characterId: CharacterId;
  /** The existing greeting text to rewrite (the `{{base}}` token). */
  readonly greeting: string;
  /** The host's own free-text instruction — appended AFTER the resolved transform fragments. May be empty. */
  readonly steer: string;
  /** The picked transform KINDS (`GREETING_TRANSFORMS` ids). Absent/empty ⇒ the free text alone. */
  readonly transforms?: readonly GreetingTransformId[];
}

export interface GenerateGreetingParams extends CharacterActorParams {
  readonly characterId: CharacterId;
  /** The host's own free-text instruction — appended AFTER the resolved transform fragments. May be empty. */
  readonly steer: string;
  /** The picked transform KINDS (`GREETING_TRANSFORMS` ids). Absent/empty ⇒ the free text alone. */
  readonly transforms?: readonly GreetingTransformId[];
}

/** Synthetic group-character mint/find (chat-injected, internal); owns the `__group__${chatId}` handle namespace. */
export interface MintGroupCharParams {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
}

export interface FindGroupCharParams {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
}

/** Re-import dedup lookup (import-injected, internal): the owner's character already carrying importHash. */
export interface FindByImportHashParams {
  readonly ownerId: UserId;
  readonly importHash: string;
}

/** By-handle lookup (seeder-injected, internal): the default-card seeder's partial-rerun resolve path. */
export interface FindByHandleParams {
  readonly ownerId: UserId;
  readonly handle: CharacterHandle;
}

/** Batched provenance lookup (hub-injected, internal): the owner's characters carrying any of `values` in
 *  `importedFrom` (an indexed `IN` read). Backs the hub search page's already-imported markers (doc 03 §2.1). */
export interface FindByImportedFromParams {
  readonly ownerId: UserId;
  readonly values: readonly string[];
}

/** The library list's LENS axes — every narrowing the toolbar offers, as SQL predicates over the same scope
 *  the page windows and the census counts (owner ruling 2026-08-13; the `MemberChatFilter` precedent in
 *  `domain/chat/persistence/queries.ts`). Homed HERE per no-inline-types §7.4 (moved from persistence/queries.ts 2026-08-14 — the drain check caught the persistence-side export). Built by the verb — the verb normalizes
 *  the request into this shape once and hands the SAME object to both the page read and the census.
 *
 *  `starred`/`archived` are TRI-STATE — `undefined` is unfiltered, which is what lets the four lookup-map
 *  callers keep reading the whole library while the library pane's own chips narrow it. */
export interface CharacterListFilter {
  /** Already trimmed + lowercased by the verb; `undefined` = the unsearched list. */
  readonly search?: string | undefined;
  readonly starred?: boolean | undefined;
  readonly archived?: boolean | undefined;
  readonly includeTagIds?: readonly TagId[] | undefined;
  readonly excludeTagIds?: readonly TagId[] | undefined;
}
