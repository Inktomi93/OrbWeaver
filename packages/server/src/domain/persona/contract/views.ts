// domain/persona/contract/views — the client read-model. `PersonaDetail` is what every read verb returns
// (create/get/list/update/createFromCharacter/listConnectedToCharacter). One home for the shape (§7.4 /
// types-in-contract).
//
// `metadata` is TYPED (`PersonaMetadata`, from `@orb/contracts/persona`) — NOT neo's `Record<string,
// unknown>` (persona.md Movement: "change from Record to typed, validated at the DB seam"). The
// `persistence/queries.ts` `detailOf` narrows the stored blob through `personaMetadataSchema` at the read
// seam, so consumers never re-parse the placement fields. `avatarHash` is joined from `assets` (the CAS
// key — `personas` only carries `avatarAssetId`), null when no avatar is attached.

import type { PersonaMetadata } from "@orb/contracts/persona";
import type { AssetId, PersonaId } from "@orb/kit/ids";

export interface PersonaDetail {
  readonly id: PersonaId;
  readonly name: string;
  readonly description: string;
  readonly avatarAssetId: AssetId | null;
  /** sha-256 of the avatar blob (CAS key) — joined from `assets`, null when no avatar attached. */
  readonly avatarHash: string | null;
  /** Typed persona metadata (placement fields + `createFromCharacter` provenance + a loose tail) —
   *  narrowed through `personaMetadataSchema` at the DB read seam; null when unset/corrupt. */
  readonly metadata: PersonaMetadata | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}
