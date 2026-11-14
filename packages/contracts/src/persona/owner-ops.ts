// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { AssetId, CharacterId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import type { Principal } from "#identity";
import type { ImportAnswer, PersonaCollisionChoices } from "#import";
import type { PortableExportNotes, PortableFile } from "#portability";
import type { BulkImportPersonaInput, BulkImportPersonasResult, JoinerPersona, PersonaDetail } from "./schemas.ts";

/** Capture the rooms a persona reaches before junction teardown; call the thunk only after the owner-scoped write succeeds. */
export type CapturePersonaRoomReachOp = (personaId: PersonaId) => Promise<() => void>;

/** The persona-owned bulk-import op the entry root wires into `import`'s `ImportContext.profile.bulkImportPersonas`.
 *  An equal-content persona is reused; a same-name, different-content one follows `collisions[foldedName]` (merge
 *  into the owned persona, or keep both). Returns `idByName` so import can attribute chat `user_name`s. */
export type BulkImportPersonas = (args: {
  readonly ownerId: UserId;
  readonly personas: readonly BulkImportPersonaInput[];
  /** Absent or unlisted means merge. */
  readonly collisions?: PersonaCollisionChoices | undefined;
}) => Promise<BulkImportPersonasResult>;

/** What {@link BulkImportPersonas} does with each persona, one answer per input in order, by the test it reuses a
 *  persona by: equal content the owner holds, or a same-name persona the collision choice merges into
 *  (`"library"`), equal content an earlier input lands (`"upload"`), or a new persona (`null`), with the persona's
 *  content key. A read: it writes nothing. `artHash` is the content hash of the avatar image, or null for a persona
 *  without one. `collisions` is the choice map the write takes, so a preview under a choice says what the run does
 *  under it. */
export type FindOwnedPersonas = (args: {
  readonly ownerId: UserId;
  readonly personas: readonly (Pick<BulkImportPersonaInput, "name" | "description" | "metadata"> & { readonly artHash: string | null })[];
  /** Absent or unlisted means merge. */
  readonly collisions?: PersonaCollisionChoices | undefined;
}) => Promise<readonly ImportAnswer[]>;

interface ListPersonasParams {
  readonly principal: Principal;
}

interface ExportPersonaParams {
  readonly principal: Principal;
  readonly personaId: PersonaId;
  /** Where stored metadata the export cannot carry is reported; the persona is written without it. */
  readonly note: PortableExportNotes;
}

/** The FILE is the unit (the thin-arm law): the single-entity door and the bundle descriptor hand the same
 *  bytes to the same verb, so the two paths can never drift. Never carries avatarAssetId — the backup shape
 *  (personaBackupSchema) excludes it. */
interface ImportPersonaParams {
  readonly principal: Principal;
  readonly bytes: Uint8Array;
}

/** `import` — NEVER throws for a malformed file (the delivery core's per-file isolation contract); a
 *  refusal carries the operator-facing reason the import door renders. `created:false` means a same-named
 *  persona was merged in place. */
type PersonaImportOutcome = { readonly ok: true; readonly persona: PersonaDetail; readonly created: boolean } | { readonly ok: false; readonly error: string };

/** The caller's personas, newest first. */
export type ListPersonasOp = (params: ListPersonasParams) => Promise<PersonaDetail[]>;

/** Read an owned persona as ONE portable file (excludes `avatarAssetId`). */
export type ExportPersonaOp = (params: ExportPersonaParams) => Promise<PortableFile>;

/** Restore ONE portable persona file, the `export` round-trip twin. Idempotent: a same-named persona is merged in place. */
export type ImportPersonaOp = (params: ImportPersonaParams) => Promise<PersonaImportOutcome>;

/** D259 — the params of a sign-up joiner's persona insert, unexecuted, which runs inside chat's signup batch. */
export interface JoinerPersonaStatementParams {
  readonly ownerId: UserId;
  readonly persona: JoinerPersona;
  readonly at: number;
}

/** Resolves a human participant's display fields. */
export type ResolveUserPublicsOp = (
  userId: UserId,
  personaId: PersonaId | null,
) => Promise<{
  displayName: string | null;
  handle: Handle | null;
  avatarAssetId: AssetId | null;
} | null>;

/** The persona to auto-anchor a new chat founded on exactly one character with exactly one connection.
 *  Ambiguity or a group founding falls through to the default persona. */
export type ResolveConnectedPersonaOp = (userId: UserId, characterIds: readonly CharacterId[]) => Promise<PersonaId | null>;
