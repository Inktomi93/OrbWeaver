// domain/character/contract/views — the client read-models (character.md §8-slot contract/views.ts).
// One home for the shapes (§7.4 / types-in-contract). The card content is DERIVED, not re-spelled: both
// views build on `CharacterCard` (the ONE canonical card shape, @orb/contracts/character) so a new card
// field has a single home (derive-don't-respell, §7.5). `CharacterDetail` is the owner read (the full live
// card + identity columns + the joined `avatarHash`); `CharacterSummary` is the library-list row (light:
// identity + name + the list-only `tokenSize` estimate). `avatarHash` is the CAS key joined from `assets`
// (the row carries only `avatarAssetId`), null when no avatar is attached.

import type { CharacterCard } from "@orb/contracts/character";
import type { CharacterId } from "@orb/kit/ids";

/** The full owned-card detail: the live card content (CharacterCard) + the identity/provenance columns +
 *  the joined avatar hash. What `create`/`get`/`update`/`duplicate`/`restore` return. */
export interface CharacterDetail extends CharacterCard {
  readonly id: CharacterId;
  readonly handle: string;
  readonly starred: boolean;
  readonly archived: boolean;
  readonly synthetic: boolean;
  /** Tri-state: null = inherit the deployment default, true = forbid, false = allow. */
  readonly forbidExternalMedia: boolean | null;
  /** Import provenance: the source label + the raw-file hash (both null for an app-authored card). */
  readonly importedFrom: string | null;
  readonly importHash: string | null;
  /** The semantic-fields hash (the "flatten" of the card — always present; recomputed on every write). */
  readonly contentHash: string;
  readonly createdAt: number;
  /** sha-256 of the avatar blob (CAS key) — joined from `assets`, null when no avatar attached. */
  readonly avatarHash: string | null;
}

/** The library-list row — light, owner-scoped, synthetic rows excluded. */
export interface CharacterSummary {
  readonly id: CharacterId;
  readonly handle: string;
  readonly name: string;
  readonly starred: boolean;
  readonly archived: boolean;
  readonly forbidExternalMedia: boolean | null;
  readonly avatarAssetId: CharacterCard["avatarAssetId"];
  readonly avatarHash: string | null;
  readonly contentHash: string;
  readonly createdAt: number;
  /** Advisory card-heft estimate (kit `estimateTokens` over the card definition) — list display only. */
  readonly tokenSize: number;
  /** The list of accepted/manual tags attached to this character. */
  readonly tags: readonly string[];
}

/** The membership-gated, level-clamped card view for a roster member (D22). */
export interface MemberCardView {
  readonly id: CharacterId;
  readonly handle: string;
  readonly name: string;
  readonly synthetic: boolean;
  readonly avatarHash: string | null;

  // Present if visibility >= 'sheet'
  readonly description?: string | null;
  readonly personality?: string | null;
  readonly scenario?: string | null;
  readonly greetings?: readonly string[];
  readonly exampleMessages?: string | null;

  // Present if visibility >= 'sheet+lore'
  readonly creatorNotes?: string | null;

  // Present if visibility === 'full'
  readonly systemPrompt?: string | null;
  readonly postHistoryInstructions?: string | null;
  readonly depthPrompt?: CharacterCard["depthPrompt"] | null;
}
