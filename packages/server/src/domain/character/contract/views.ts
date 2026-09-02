// domain/character/contract/views — the client read-models. Both derive from CharacterCard (the one
// canonical card shape) rather than re-spelling fields. CharacterDetail is the owner read; CharacterSummary
// is the light library-list row. avatarHash is the CAS key joined from assets, null when no avatar attached.

import type { CharacterCard, CharacterProvenance } from "@orb/contracts/character";

import type { TagView } from "@orb/contracts/tag";
import type { ThemeBackground, ThemeOverride } from "@orb/contracts/theme";
import type { CharacterHandle, CharacterId } from "@orb/kit/ids";

/** The full owned-card detail. What create/get/update/duplicate/restore return. The card's face fields
 *  compose `#card-face` (D137(E)) at the SCHEMA level; this view CONFORMS to the nullable-description
 *  `ResolvedCardFace` structurally (pinned in `tests/contracts/card-face/index.contract.test.ts` — a
 *  zod-inferred card's mutable members cannot `extends` a readonly interface identically, so the pin is
 *  the belt). (`CharacterSummary` below is deliberately NOT a face carrier: the list row omits
 *  `description`.) */
export interface CharacterDetail extends CharacterCard {
  readonly id: CharacterId;
  readonly handle: CharacterHandle;
  readonly starred: boolean;
  readonly archived: boolean;
  readonly synthetic: boolean;
  /** Tri-state: null = inherit deployment default, true = forbid, false = allow. */
  readonly forbidExternalMedia: boolean | null;
  /** Tri-state: null = inherit deployment default, true = trusted, false = force untrusted. */
  readonly trustHtml: boolean | null;
  /** The interactive-card opt-in (#111) — `true` = this card's routed frames are built under the
   *  `interactive` posture, `null`/`false` = static (no deployment tier inherits here). On the DETAIL only:
   *  this view is what the editor and the roster's seat decoration pass to `resolveRenderPolicy` as the
   *  card's `RenderPolicyOverride`, while the library-list summary renders no card content and reads none
   *  of the three policy columns. */
  readonly interactiveHtml: boolean | null;
  /** Raw, unmerged theme-token override; null = inherit the user's global theme. */
  readonly themeOverride: ThemeOverride | null;
  /** BG-C — the raw carried card BACKGROUND source (the `themeOverride` twin); null = no card background. */
  readonly backgroundOverride: ThemeBackground | null;
  readonly importedFrom: string | null;
  readonly importHash: string | null;
  /** #865 — the CLOSED where-it-came-from verdict, derived ONCE at the read seam (`characterProvenanceOf`)
   *  from `importedFrom` + `creator`. The Origin readout DISPATCHES on this rather than re-deriving it, so
   *  the detail and the library row can never disagree about a card's origin. Distinct from the card's own
   *  `source` (the ST V3 provenance-URL list this view inherits from `CharacterCard`). */
  readonly provenance: CharacterProvenance;
  readonly contentHash: string;
  readonly createdAt: number;
  readonly avatarHash: string | null;
  /** The accepted canonical tags (editor chips); pending suggestions read through tag's own surface. */
  readonly tags: readonly TagView[];
}

/** The library-list row — light, owner-scoped, synthetic rows excluded. */
export interface CharacterSummary {
  readonly id: CharacterId;
  readonly handle: CharacterHandle;
  readonly name: string;
  readonly starred: boolean;
  readonly archived: boolean;
  readonly forbidExternalMedia: boolean | null;
  readonly trustHtml: boolean | null;
  readonly themeOverride: ThemeOverride | null;
  /** BG-C — the raw carried card BACKGROUND source (the `themeOverride` twin); null = no card background. */
  readonly backgroundOverride: ThemeBackground | null;
  readonly avatarAssetId: CharacterCard["avatarAssetId"];
  readonly avatarHash: string | null;
  readonly contentHash: string;
  readonly createdAt: number;
  /** Advisory card-heft estimate — list display only. */
  readonly tokenSize: number;
  readonly tags: readonly TagView[];
  /** LEFT JOIN character_summaries.elevatorPitch; null until the distill producer has run. */
  readonly elevatorPitch: string | null;
  /**
   * WHEN THIS OWNER LAST SPOKE TO HER — `MAX(coalesce(newest message, chat.updated_at))` over her
   * member-visible rooms; null = never chatted. Drives the `recent` sort + resume-or-new, and the landing
   * PRINTS it ("chatted 3h ago").
   *
   * IT IS CANON, NOT `character_stats` (#1131). The read used to LEFT JOIN the stats rollup's
   * `last_activity_at`, which is turn ECONOMICS on a different clock: measured on the dev library
   * 2026-09-02, nine of ten characters with real seated chats had no stats row at all — so the Characters
   * landing's "Recently chatted" shelf could only ever show one face — and the tenth's rollup stamp
   * disagreed with her newest message by 29 days. Now it is the SAME expression `chat.listChats` orders and
   * displays by (`@orb/db/kit` `chatRecencyExpr`), so the landing, the editor header and the context pane
   * cannot print three answers.
   */
  readonly lastChattedAt: number | null;
  /**
   * #865 — HOW MANY THREADS this character has: a `COUNT` of the same member-visible seated rooms
   * `lastChattedAt` maxes over, which is what the editor header's "N chats" and the context band's chip
   * already counted through `chat.listChats.totalCount`.
   *
   * IT IS NOT `character_stats.chats` (#1131). That counter is bumped only for a room's FIRST founding
   * character (`chatCreatedDelta`, `domain/chat/verbs/claim-chat.ts`); a character seated second — or
   * joined into a running room — contributes message deltas and never a chat, so the rollup read `0` for a
   * character the rest of the app said had one.
   *
   * NOT NULLABLE: a character with no rooms counts zero, and the face prints a NUMBER — a nullable field
   * would push a three-state decision onto every consumer for a distinction the product does not make. The
   * two chat-count SORTS see the same zero and still sink it to their tail.
   */
  readonly chatCount: number;
  /** #865 — the CLOSED where-it-came-from verdict; the {@link CharacterDetail} twin, same one derivation.
   *  This is what lets the landing name its fresh-install shelf without a second read per row. */
  readonly provenance: CharacterProvenance;
  /**
   * Does ANOTHER of this owner's characters carry the same name (case-insensitively)? #517 — the row's
   * DISAMBIGUATION gate, and the reason it is a projection field rather than a client derivation.
   *
   * The library is keyset-paged 30 at a time, so a collision scan over the loaded rows would answer about
   * the PAGE: the same name would be "unique" on page 1 and ambiguous on page 4, and a row's announced
   * identity would change under a screen-reader user as pages arrived. This is computed over the owner's
   * WHOLE non-synthetic library and is deliberately LENS-INDEPENDENT — whether two characters share a name
   * is a fact about the library, not about the current search, so a row cannot lose (or gain) its
   * disambiguator by filtering.
   */
  readonly nameIsAmbiguous: boolean;
}
