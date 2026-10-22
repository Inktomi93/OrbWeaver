// @orb/contracts/persona — the persona wire schemas (create/update/metadata). Persona no longer
// imports `@orb/contracts/world-info`: the `{depth, role}` inject shape comes from `@orb/kit/injection`
// (the shared neutral primitive every injector uses), never a world-info-local re-spell.

// `title` is NOT a face field (persona-only, D137(E)) — its limit stays persona-local.

import type { AssetId, CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { injectionDirectiveSchema } from "@orb/kit/injection";
import { PERSONA_DESCRIPTION_POSITIONS } from "@orb/kit/persona";
import { z } from "zod";
import type { CardFace, ResolvedCardFace } from "#card-face";
import { cardFaceFields } from "#card-face";

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
}) satisfies z.ZodType<Record<string, unknown>>;

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

/** D259 — the longest description a sign-up joiner may send. The signup doors are anonymous and body-capped, so the
 *  joiner writes a short one there and a longer one later in the persona editor. */
export const JOINER_PERSONA_DESCRIPTION_MAX = 1000;

/** D259 — the persona a sign-up joiner names before their seat exists. The signup batch creates it and seats the
 *  new account as it, so a sign-up seat never starts without a persona. STRICT: only the face's name and
 *  description ride the signup doors. */
export const joinerPersonaSchema = z.strictObject({
  name: cardFaceFields.name,
  description: cardFaceFields.description.max(JOINER_PERSONA_DESCRIPTION_MAX),
});
export type JoinerPersona = z.infer<typeof joinerPersonaSchema>;

export const updatePersonaSchema = createPersonaSchema.partial();
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>;

// The export/import round-trip shape: `createPersonaSchema` minus `avatarAssetId` (a binary asset
// reference can't travel in a JSON backup).
export const personaBackupSchema = createPersonaSchema.omit({ avatarAssetId: true });
/** The portable JSON body before the persona serde narrows it to its canonical `PersonaBackup`.
 * @public twin: personaBackupSchema
 */
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
  /** Inputs linked to an owned persona of the same name but different content (the merge choice). Not in
   *  `personasSkipped`, which counts equal-content reuse. */
  readonly personasMerged: number;
  /** The folded names of the merged inputs, once each. A split folder runs this write once per upload, so the
   *  client unions the keys across uploads instead of summing counts. */
  readonly mergedKeys: readonly string[];
  readonly defaultPersonaId: PersonaId | null;
  readonly idByName: Record<string, PersonaId>;
}

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

/** The persona-side read of the character⇄persona junction (`listConnectedCharacters`, #866 S4 — the
 *  editor's "Connected characters" section). Deliberately a SUMMARY, not the character detail: the persona
 *  domain names only what its relation list renders (id to act on, name + title to display) — the full card
 *  stays behind the character domain's own verbs, so this view can never become a second character home. */
export interface ConnectedCharacterView {
  readonly id: CharacterId;
  readonly name: string;
}

export const personaDetailSchema = z.strictObject({
  ...cardFaceFields,
  id: typeIdSchema(ID_PREFIX.persona),
  title: z.string().nullable(),
  avatarHash: z.string().nullable(),
  metadata: personaMetadataSchema.nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
}) satisfies z.ZodType<PersonaDetail>;

export const connectedCharacterViewSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
}) satisfies z.ZodType<ConnectedCharacterView>;

/** `remove` — `deleted` is always `true` on success (a not-owned/missing persona throws instead).
 *  `newDefaultPersonaId` names the persona the default moved to when the deleted one was the default, so the
 *  client can say so; `null` when the default did not move. */
export interface RemovePersonaResult {
  readonly deleted: boolean;
  readonly newDefaultPersonaId: PersonaId | null;
}

/** `disconnectFromCharacter` — `false` when the junction row was already absent (idempotent no-op). */
export interface DisconnectResult {
  readonly disconnected: boolean;
}

export const removePersonaResultSchema = z.strictObject({
  deleted: z.boolean(),
  newDefaultPersonaId: typeIdSchema(ID_PREFIX.persona).nullable(),
}) satisfies z.ZodType<RemovePersonaResult>;

export const disconnectResultSchema = z.strictObject({ disconnected: z.boolean() }) satisfies z.ZodType<DisconnectResult>;

// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

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

/** Resolve the presentation surface of personas a room's PARTICIPANTS consent to.
 *
 *  `personaIds` are the ids the room references (its anchor + its present humans' active personas);
 *  `allowedOwnerIds` are the room's PRESENT human participants. The result carries an entry ONLY for an id
 *  that exists AND is owned by one of `allowedOwnerIds` — a foreign, deleted, or departed-member persona is
 *  simply ABSENT (indistinguishable, no existence oracle). `chatId` is the room these ids belong to: its pin
 *  (`chats.anchorPersonaId`) also resolves, whoever owns it. */
export type ResolvePersonasForParticipants = (args: {
  readonly chatId: ChatId;
  readonly personaIds: readonly PersonaId[];
  readonly allowedOwnerIds: readonly UserId[];
}) => Promise<ReadonlyMap<PersonaId, PersonaListView>>;

/** The user's default persona (`seeds.defaultPersonaId`), validated owned/alive at the root — the seat seed
 *  after an explicit anchor and the connected persona. */
export type ResolveDefaultPersonaOp = (userId: UserId) => Promise<PersonaId | null>;

/** The user's last-played persona (`seeds.currentPersonaId`) — the floor below the default. */
export type ResolveCurrentPersonaOp = (userId: UserId) => Promise<PersonaId | null>;

export const personaIdInputSchema = z.object({ personaId: typeIdSchema(ID_PREFIX.persona) });

export const personaCharacterInputSchema = z.object({ characterId: typeIdSchema(ID_PREFIX.character) });

/** A persona a profile upload would write, with the content hash of its avatar bytes — what the pre-commit
 *  review compares against the owner's personas. */
export interface IncomingPersona {
  readonly name: string;
  readonly description: string;
  readonly metadata: PersonaMetadata | null;
  readonly artHash: string | null;
}
