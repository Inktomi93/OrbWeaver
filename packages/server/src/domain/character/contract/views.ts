// domain/character/contract/views — the client read-models.
// One home for the shapes (§7.4 / types-in-contract). The card content is DERIVED, not re-spelled: both
// views build on `CharacterCard` (the ONE canonical card shape, @orb/contracts/character) so a new card
// field has a single home (derive-don't-respell, §7.5). `CharacterDetail` is the owner read (the full live
// card + identity columns + the joined `avatarHash`); `CharacterSummary` is the library-list row (light:
// identity + name + the list-only `tokenSize` estimate). `avatarHash` is the CAS key joined from `assets`
// (the row carries only `avatarAssetId`), null when no avatar is attached.

import type { CharacterCard } from "@orb/contracts/character";
import type { TagView } from "@orb/contracts/tag";
import type { ThemeOverride } from "@orb/contracts/theme";
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
  /** D44 §12.0 render-trust OPT-IN. Tri-state: null = inherit the deployment default, true = trusted,
   *  false = force untrusted. */
  readonly trustHtml: boolean | null;
  /** D44 §12.1/§12.5 — the per-character theme-token override. `null` = no override (inherit the user's
   *  global selected theme). RAW, unmerged (resolution is a client `<ThemeScope>` nesting concern). */
  readonly themeOverride: ThemeOverride | null;
  /** Import provenance: the source label + the raw-file hash (both null for an app-authored card). */
  readonly importedFrom: string | null;
  readonly importHash: string | null;
  /** The semantic-fields hash (the "flatten" of the card — always present; recomputed on every write). */
  readonly contentHash: string;
  readonly createdAt: number;
  /** sha-256 of the avatar blob (CAS key) — joined from `assets`, null when no avatar attached. */
  readonly avatarHash: string | null;
  /** The ACCEPTED canonical tags (`character_tags ⋈ tags`, status='accepted' — the editor chips).
   *  Pending staged suggestions are NOT here (they read through tag's own surface). */
  readonly tags: readonly TagView[];
}

/** The library-list row — light, owner-scoped, synthetic rows excluded. */
export interface CharacterSummary {
  readonly id: CharacterId;
  readonly handle: string;
  readonly name: string;
  readonly starred: boolean;
  readonly archived: boolean;
  readonly forbidExternalMedia: boolean | null;
  readonly trustHtml: boolean | null;
  readonly themeOverride: ThemeOverride | null;
  readonly avatarAssetId: CharacterCard["avatarAssetId"];
  readonly avatarHash: string | null;
  readonly contentHash: string;
  readonly createdAt: number;
  /** Advisory card-heft estimate (kit `estimateTokens` over the card definition) — list display only. */
  readonly tokenSize: number;
  /** The ACCEPTED canonical tags (the library tag filter); pending suggestions excluded. */
  readonly tags: readonly TagView[];
  /** The discovery-domain distilled one-liner (LEFT JOIN `character_summaries.elevatorPitch`, D28-keyed by
   *  characterId) — the LIST subtitle's "distilled pitch" source (§4.4 fallback ladder: pitch → tag line →
   *  handle). `null` until the distill producer has run OR when no summary row exists. NOT `refinery`
   *  (that's the card-QUALITY grade — a different domain). */
  readonly elevatorPitch: string | null;
  /** When this character was last chatted with (LEFT JOIN `character_stats.lastActivityAt`, MAX-merged on
   *  every canon write; joined via `characters` on the owner per D23 — `character_stats` has no `ownerId`).
   *  `null` = never chatted. Drives the §4.5 `recent` sort + the §4.4/§9c resume-or-new decision. Freshness
   *  under `staleTime:Infinity` is bus-driven: the server fans the user-bus `chatsChanged` on every canon-commit
   *  terminal moment (messageCommitted/turnCompleted) + chat lifecycle op, which is the SOLE `character.list`
   *  invalidate driver — same AND cross device (client `data/invalidation.ts` `chatsChanged` arm). */
  readonly lastChattedAt: number | null;
}
