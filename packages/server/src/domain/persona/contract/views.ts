// domain/persona/contract/views — the client read-model. PersonaDetail is what every read verb returns.
// metadata is typed (not Record<string, unknown>); persistence/queries.ts detailOf narrows the stored
// blob through personaMetadataSchema at the read seam. avatarHash is joined from assets, null when unset.

import type { PersonaMetadata } from "@orb/contracts/persona";
import type { AssetId, PersonaId } from "@orb/kit/ids";

export interface PersonaDetail {
  readonly id: PersonaId;
  readonly name: string;
  /** Display subtitle for pickers/lists — never injected into the prompt. */
  readonly title: string | null;
  readonly description: string;
  readonly starred: boolean;
  readonly avatarAssetId: AssetId | null;
  readonly avatarHash: string | null;
  readonly metadata: PersonaMetadata | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}
