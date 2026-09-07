// domain/persona/contract/views — the client read-model. PersonaDetail is what every read verb returns.
// metadata is typed (not Record<string, unknown>); persistence/queries.ts detailOf narrows the stored
// blob through personaMetadataSchema at the read seam. avatarHash is joined from assets, null when unset.

import type { CardFace, ResolvedCardFace } from "@orb/contracts/card-face";
import type { PersonaMetadata } from "@orb/contracts/persona";
import type { CharacterId, PersonaId, UserId } from "@orb/kit/ids";

/** Extends BOTH face planes (D137(E)): the authored face (`avatarAssetId`) AND the resolved face
 *  (`avatarHash` joined from assets) — a persona detail is the row + its resolved avatar. `D = string`:
 *  persona description is NOT NULL ("" is a value to `{{persona}}`). */
export interface PersonaDetail extends CardFace<string>, ResolvedCardFace<string> {
  readonly id: PersonaId;
  /** Display subtitle for pickers/lists — never injected into the prompt. */
  readonly title: string | null;
  readonly metadata: PersonaMetadata | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** A persona's PRESENTATION SURFACE for a room whose participants consent to it (the multi-human resolution
 *  widening — the `ResolvePersonasForParticipants` op, `contract/ops.ts`). Deliberately NARROWER than {@link PersonaDetail}: name +
 *  description (what `{{user}}`/`{{persona}}` render) + the `metadata` the chat assembly reads for
 *  `descriptionPlacement`, plus `ownerId` so a caller can attribute a resolved persona to the member
 *  playing it. NOT the persona row: `avatarAssetId`/`avatarHash`/`title`/`starred`/timestamps stay behind
 *  the owner-scoped verbs (playing a persona in a room consents to its presentation, never to the entity). */
export interface PersonaListView {
  readonly id: PersonaId;
  readonly ownerId: UserId;
  readonly name: string;
  readonly description: string;
  readonly metadata: PersonaMetadata | null;
}

/** The persona-side read of the character⇄persona junction (`listConnectedCharacters`, #866 S4 — the
 *  editor's "Connected characters" section). Deliberately a SUMMARY, not the character detail: the persona
 *  domain names only what its relation list renders (id to act on, name + title to display) — the full card
 *  stays behind the character domain's own verbs, so this view can never become a second character home. */
export interface ConnectedCharacterView {
  readonly id: CharacterId;
  readonly name: string;
}
