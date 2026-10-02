// domain/persona/contract/views — the client read-model. PersonaDetail is what every read verb returns.
// metadata is typed (not Record<string, unknown>); persistence/queries.ts detailOf narrows the stored
// blob through personaMetadataSchema at the read seam. avatarHash is joined from assets, null when unset.

import type { PersonaMetadata } from "@orb/contracts/persona";
import type { PersonaId, UserId } from "@orb/kit/ids";

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

export type { ConnectedCharacterView, PersonaDetail } from "@orb/contracts/persona";
