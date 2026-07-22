// domain/character/contract/views — the client read-models. Both derive from CharacterCard (the one
// canonical card shape) rather than re-spelling fields. CharacterDetail is the owner read; CharacterSummary
// is the light library-list row. avatarHash is the CAS key joined from assets, null when no avatar attached.

import type { CharacterCard } from "@orb/contracts/character";
import type { CardEvolutionChange, CardEvolutionProposalStatus, CrewSpan } from "@orb/contracts/crew";
import type { TagView } from "@orb/contracts/tag";
import type { ThemeBackground, ThemeOverride } from "@orb/contracts/theme";
import type { CardEvolutionProposalId, CharacterId, ChatId } from "@orb/kit/ids";

/** The full owned-card detail. What create/get/update/duplicate/restore return. */
export interface CharacterDetail extends CharacterCard {
  readonly id: CharacterId;
  readonly handle: string;
  readonly starred: boolean;
  readonly archived: boolean;
  readonly synthetic: boolean;
  /** Tri-state: null = inherit deployment default, true = forbid, false = allow. */
  readonly forbidExternalMedia: boolean | null;
  /** Tri-state: null = inherit deployment default, true = trusted, false = force untrusted. */
  readonly trustHtml: boolean | null;
  /** Raw, unmerged theme-token override; null = inherit the user's global theme. */
  readonly themeOverride: ThemeOverride | null;
  /** BG-C — the raw carried card BACKGROUND source (the `themeOverride` twin); null = no card background. */
  readonly backgroundOverride: ThemeBackground | null;
  readonly importedFrom: string | null;
  readonly importHash: string | null;
  readonly contentHash: string;
  readonly createdAt: number;
  readonly avatarHash: string | null;
  /** The accepted canonical tags (editor chips); pending suggestions read through tag's own surface. */
  readonly tags: readonly TagView[];
}

/** One pending card-evolution proposal for the character-page review surface (chat-crew-design/04 §8). The
 *  `changes` carry per-change `{field, op, text, rationale}` so the client renders a per-change diff +
 *  checkboxes; `sourceSpan` is the audited transcript window (null for a non-crew filing). */
export interface CardEvolutionProposalView {
  readonly id: CardEvolutionProposalId;
  readonly characterId: CharacterId;
  readonly chatId: ChatId | null;
  readonly changes: readonly CardEvolutionChange[];
  readonly sourceSpan: CrewSpan | null;
  readonly status: CardEvolutionProposalStatus;
  readonly createdAt: number;
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
  /** LEFT JOIN character_stats.lastActivityAt; null = never chatted. Drives the recent sort + resume-or-new. */
  readonly lastChattedAt: number | null;
}
