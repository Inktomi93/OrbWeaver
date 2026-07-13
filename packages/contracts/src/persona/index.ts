// @orb/contracts/persona — the persona wire schemas (create/update/metadata). Persona no longer
// imports `@orb/contracts/world-info`: the `{depth, role}` inject shape comes from `@orb/kit/injection`
// (the shared neutral primitive every injector uses), never a world-info-local re-spell.

import type { AssetId, PersonaId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { injectionDirectiveSchema } from "@orb/kit/injection";
import { PERSONA_DESCRIPTION_POSITIONS } from "@orb/kit/persona";
import { z } from "zod";

const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 100_000;

// `descriptionPosition` drives the in-prompt-vs-at-depth-vs-none decision. `sourceCharacterId` +
// `swapMacros` are the non-lossy `createFromCharacter` provenance: a persona minted from a card can
// re-derive its description if the card is edited.
export const personaMetadataSchema = z
  .object({
    descriptionPosition: z.enum(PERSONA_DESCRIPTION_POSITIONS).optional(),
    /** Depth + role for the `at_depth` placement — the shared injection directive (`@orb/kit/injection`). */
    inject: injectionDirectiveSchema.optional(),
    sourceCharacterId: typeIdSchema(ID_PREFIX.character).optional(),
    swapMacros: z.boolean().optional(),
  })
  .loose();
export type PersonaMetadata = z.infer<typeof personaMetadataSchema>;

/** Write-side metadata guard: the blob stays a lenient open record, but known fields are validated when
 *  present so a typo'd `descriptionPosition`/`inject` is rejected at WRITE instead of silently no-op'ing. */
export const personaMetadataWriteSchema = z
  .record(z.string(), z.unknown())
  .superRefine((val, ctx): void => {
    const known = personaMetadataSchema.safeParse(val);
    if (!known.success) {
      for (const issue of known.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
      }
    }
  });
export type PersonaMetadataWrite = z.infer<typeof personaMetadataWriteSchema>;

export const createPersonaSchema = z.object({
  name: z.string().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
  /** Display subtitle for pickers/lists (ST persona "title") — never injected into the prompt. */
  title: z.string().max(NAME_MAX_LENGTH).nullable().optional(),
  description: z.string().max(DESCRIPTION_MAX_LENGTH),
  /** Favorite flag (ST persona favorites) — pickers sort/highlight starred first. */
  starred: z.boolean().optional(),
  avatarAssetId: typeIdSchema(ID_PREFIX.asset).nullable().optional(),
  metadata: personaMetadataWriteSchema.nullable().optional(),
});
export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;

export const updatePersonaSchema = createPersonaSchema.partial();
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>;

// The export/import round-trip shape: `createPersonaSchema` minus `avatarAssetId` (a binary asset
// reference can't travel in a JSON backup).
export const personaBackupSchema = createPersonaSchema.omit({ avatarAssetId: true });
export type PersonaBackupInput = z.infer<typeof personaBackupSchema>;

/** One resolved persona to bulk-import. `isDefault` marks the profile's `power_user.default_persona`.
 *  `avatarAssetId` is set by the driver after storing the `User Avatars/<file>` bytes. */
export interface BulkImportPersonaInput {
  readonly name: string;
  readonly description: string;
  readonly avatarAssetId: AssetId | null;
  readonly metadata: PersonaMetadata | null;
  readonly isDefault: boolean;
}

/** The result of one persona bulk-import run. `idByName` maps the lowercased-trimmed name → the resolved id
 *  for EVERY non-empty input name (created AND reused) — import copies it into `personaByUserName`. */
export interface BulkImportPersonasResult {
  readonly personasCreated: number;
  readonly personasSkipped: number;
  readonly defaultPersonaId: PersonaId | null;
  readonly idByName: Record<string, PersonaId>;
}
