import type { CharacterActorParams, CharacterLibraryLens, CharacterListCursor, CharacterListSort } from "@orb/contracts/character";
import type { GreetingTransformId } from "@orb/contracts/preset";
import type { AssetId, CharacterId, CharacterSnapshotId, UserId } from "@orb/kit/ids";
import type { IanaTimeZone } from "@orb/kit/time";

export type { PluginCardDataLookup, PluginCardDataTarget } from "@orb/contracts/character";

// domain/character/contract/params — every verb's *Params, declared ONCE. Every USER-facing verb carries
// the resolved principal; ownership scopes off principal.userId, never a users read. The synthetic-identity
// ops (Mint/Find/FindByImportHash/FindByHandle) are internal and act on an already-resolved ownerId.

export type { CharacterListCursor, CharacterListSort } from "@orb/contracts/character";

/** The library list's read, with EVERY lens the toolbar offers resolved server-side (owner ruling
 *  2026-08-13, the `listChats` precedent): a keyset page can only ever search/filter what it has fetched, so
 *  a client-side predicate over the loaded window is a claim the surface has no standing to make.
 *
 *  The two boolean axes are TRI-STATE — `undefined` is UNFILTERED, not `false`. That is what keeps the
 *  lookup-map callers (portrait maps, pickers, the agent nav) whole while the library's own chips narrow:
 *  omitting `archived` still serves archived rows, and only the toggle's OFF state sends `archived: false`. */
export interface ListCharactersParams extends CharacterActorParams, CharacterLibraryLens {
  readonly sort?: CharacterListSort;
  /** Cursor's sort discriminant MUST match `sort`; a mismatch is rejected rather than applying the wrong keyset. */
  readonly cursor?: CharacterListCursor;
  readonly limit?: number;
}

/**
 * The GROUP-BY-TAG census request (#1696) — the same lens axes {@link ListCharactersParams} carries, and
 * NOTHING ELSE. No `sort`, no `cursor`, no `limit`: a census is not a page, and every one of those three
 * would be a way to make the answer window-dependent again, which is the whole defect.
 */
export interface ListCharacterTagGroupsParams extends CharacterActorParams, CharacterLibraryLens {}

export interface RemoveCharacterParams extends CharacterActorParams {
  readonly characterId: CharacterId;
}

export interface NamesByAvatarAssetsParams extends CharacterActorParams {
  readonly assetIds: readonly AssetId[];
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
  /** The host's reported zone for the template's time macros; absent ⇒ UTC. */
  readonly timeZone?: IanaTimeZone | undefined;
}

export interface GenerateGreetingParams extends CharacterActorParams {
  readonly characterId: CharacterId;
  /** The host's own free-text instruction — appended AFTER the resolved transform fragments. May be empty. */
  readonly steer: string;
  /** The picked transform KINDS (`GREETING_TRANSFORMS` ids). Absent/empty ⇒ the free text alone. */
  readonly transforms?: readonly GreetingTransformId[];
  /** The host's reported zone for the template's time macros; absent ⇒ UTC. */
  readonly timeZone?: IanaTimeZone | undefined;
}

/** The JSON-then-PNG exception of the import identity (import-injected, internal): the owner's character that
 *  landed from a JSON card takes this stored art and the with-art `importHash`, once. */
export interface AttachImportedArtParams {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly avatarAssetId: AssetId;
  readonly importHash: string;
}

/** A shipped card's own export identity (seeder-injected, internal), written only onto a row that has none. */
export interface StampImportIdentityParams {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly importHash: string;
}

/** By-display-name lookup (import-injected, internal): a transcript names its character the way the user sees it. */
export interface FindByNameParams {
  readonly ownerId: UserId;
  readonly name: string;
  readonly caseInsensitive?: boolean;
}

/** The library list's LENS axes — every narrowing the toolbar offers, as SQL predicates over the same scope
 *  the page windows and the census counts (owner ruling 2026-08-13; the `MemberChatFilter` precedent in
 *  `domain/chat/persistence/queries.ts`). Homed HERE per §7.4. Built by the verb — the verb normalizes
 *  the request into this shape once and hands the SAME object to both the page read and the census.
 *
 *  `starred`/`archived` are TRI-STATE — `undefined` is unfiltered, which is what lets the four lookup-map
 *  callers keep reading the whole library while the library pane's own chips narrow it. */
export interface CharacterListFilter extends CharacterLibraryLens {}
