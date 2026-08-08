// @orb/contracts/card-face — the ONE home of the four-field card FACE both library entities share
// (D137(E)): `name` / `description` / `starred` / `avatarAssetId`. SHAPE ONLY — no table, no kind
// discriminator, no ownership/copy/resolution semantics (those walls are D131/D133/D122's and stay in
// their domains). Composers SPREAD `cardFaceFields` — the same zod objects, so the single home is
// REFERENCE equality, pinned per field in `tests/contracts/card-face/index.contract.test.ts`; per-domain
// optionality/nullability wraps around a field are that composer's WRITE SEMANTICS, not drift (persona
// description NOT NULL because "" is a value to `{{persona}}`; the character card's is nullable for
// V2/V3 card-spec fidelity — the generic `CardFace<D>` states it).
//
// Composers today: `@orb/contracts/persona` (`createPersonaSchema`) + `@orb/contracts/character`
// (`characterCardSchema`/`createCharacterSchema`/`updateCharacterSchema`) + the view contracts
// (`PersonaDetail`, `CharacterDetail` — the resolved plane). The future agent card view (D60) composes
// this same face instead of minting a third spelling. Scope is the measured overlap ONLY: card content
// (personality/scenario/greetings/…) is character-only by design — a "shared" home with one composer
// would be a false generalization.

import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** The face limits — ONE spelling (replaces persona's `NAME_MIN_LENGTH`/`NAME_MAX_LENGTH`/
 *  `DESCRIPTION_MAX_LENGTH` and character's `NAME_MIN`/`NAME_MAX` + `TEXT_MAX`-at-face-uses; character's
 *  non-face `TEXT_MAX` uses — greetings/systemPrompt/… — stay character-local: card content, not face). */
export const CARD_FACE_LIMITS = { nameMin: 1, nameMax: 200, textMax: 100_000 } as const;

/** The shared field VALIDATORS — composers spread these; per-domain optionality/nullability wraps per
 *  composer (write semantics, see the header). These objects ARE the single home: never re-spell one. */
export const cardFaceFields = {
  name: z.string().min(CARD_FACE_LIMITS.nameMin).max(CARD_FACE_LIMITS.nameMax),
  description: z.string().max(CARD_FACE_LIMITS.textMax),
  starred: z.boolean(),
  avatarAssetId: typeIdSchema(ID_PREFIX.asset).nullable(),
} as const;

/** The AUTHORED face (row-plane): description nullability is the composer's
 *  (persona: `string`; character: `string | null`). */
export interface CardFace<D extends string | null = string | null> {
  readonly name: string;
  readonly description: D;
  readonly starred: boolean;
  readonly avatarAssetId: AssetId | null;
}

/** The RESOLVED face (read-plane): the avatar joined to its CAS hash — what views and cast entries
 *  project. */
export interface ResolvedCardFace<D extends string | null = string | null> {
  readonly name: string;
  readonly description: D;
  readonly starred: boolean;
  readonly avatarHash: string | null;
}
