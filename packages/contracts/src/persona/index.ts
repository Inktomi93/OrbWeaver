// @orb/contracts/persona — the persona wire schemas (create/update/metadata). Persona no longer
// imports `@orb/contracts/world-info`: the `{depth, role}` inject shape comes from `@orb/kit/injection`
// (the shared neutral primitive every injector uses), never a world-info-local re-spell.

import type { AssetId, PersonaId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { injectionDirectiveSchema } from "@orb/kit/injection";
import { PERSONA_DESCRIPTION_POSITIONS } from "@orb/kit/persona";
import { z } from "zod";
import { cardFaceFields } from "#card-face";

// `title` is NOT a face field (persona-only, D137(E)) — its limit stays persona-local.
const TITLE_MAX_LENGTH = 200;

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
    /** PROVENANCE: this row is the default-persona seeder's own artifact (`entry/boot/seed-default-persona`).
     *  It is the seeder's SECOND idempotency layer — the persona analogue of the character seeder's
     *  per-card handle-conflict tolerance, which is what kept the card pack single when the persisted
     *  `onboarding.defaultPersonaSeeded` latch was lost mid-life and the persona seeder minted a duplicate
     *  (#461). Personas carry no unique key by design (same-named personas are supported, #458), so the
     *  seeder marks what it made instead of guessing from name/title copy. Users never write it; the seeder
     *  is the only producer, and nothing downstream branches on it except the seeder's own skip. */
    seededDefault: z.boolean().optional(),
  })
  .loose();
export type PersonaMetadata = z.infer<typeof personaMetadataSchema>;

/** Write-side metadata guard: the blob stays a lenient open record, but known fields are validated when
 *  present so a typo'd `descriptionPosition`/`inject` is rejected at WRITE instead of silently no-op'ing.
 *
 *  WHY THE TWO HOPS AND NOT JUST `personaMetadataSchema` (audited 2026-08-02 — the loose schema alone accepts
 *  the identical set): the OPAQUE `Record<string, unknown>` OUTPUT is the point. It keeps the wire input
 *  UNNARROWED so every writer — transport AND the import domain, which never crosses this schema — must go
 *  through the ONE narrowing seam (`domain/persona/substrate/metadata.ts` `normalizeWriteMetadata`, typed on
 *  exactly this record). Collapsing to the loose schema would hand transport a pre-narrowed value and leave
 *  the import path shaped differently — two shapes into one seam.
 *
 *  The re-emit flattens every issue to `code:"custom"` and that is a KNOWN, ACCEPTED loss: forwarding the
 *  original (`ctx.addIssue(issue)`) works at runtime but does NOT typecheck on zod 4.4.3 — the finalized
 *  `$ZodIssue` arms lack the `[x: string]: unknown` index signature `$ZodRawIssue` requires (probed; TS2345),
 *  and the only way through is a cast this repo bans. `message` and `path` survive, which is what a client
 *  renders; only the machine-readable `code`/payload is lost. */
export const personaMetadataWriteSchema = z.record(z.string(), z.unknown()).superRefine((val, ctx): void => {
  const known = personaMetadataSchema.safeParse(val);
  if (!known.success) {
    for (const issue of known.error.issues) {
      ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
    }
  }
});
/** The intentionally open metadata record accepted and preserved by the persona write boundary. */
export type PersonaMetadataWrite = z.output<typeof personaMetadataWriteSchema>;

// The FACE fields spread `cardFaceFields` (D137(E) — one home, reference-equality-pinned); the wraps
// (`description` bare = REQUIRED, starred/avatarAssetId `.optional()`) are persona's write semantics.
export const createPersonaSchema = z.object({
  name: cardFaceFields.name,
  /** Display subtitle for pickers/lists (ST persona "title") — never injected into the prompt. */
  title: z.string().max(TITLE_MAX_LENGTH).nullable().optional(),
  description: cardFaceFields.description,
  /** Favorite flag (ST persona favorites) — pickers sort/highlight starred first. */
  starred: cardFaceFields.starred.optional(),
  avatarAssetId: cardFaceFields.avatarAssetId.optional(),
  metadata: personaMetadataWriteSchema.nullable().optional(),
});
export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;

export const updatePersonaSchema = createPersonaSchema.partial();
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>;

// The export/import round-trip shape: `createPersonaSchema` minus `avatarAssetId` (a binary asset
// reference can't travel in a JSON backup).
export const personaBackupSchema = createPersonaSchema.omit({ avatarAssetId: true });
/** The portable JSON body before the persona serde narrows it to its canonical `PersonaBackup`. */
export type PersonaBackupWire = z.output<typeof personaBackupSchema>;

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
