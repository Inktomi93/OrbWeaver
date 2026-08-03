// The typed API surface: PersonaContext (the DI bundle) and PersonaService (the verb interface). Owner-scoped
// CRUD + the character⇄persona junction + the non-lossy createFromCharacter mint. Every verb gates on
// `principal.userId`; persona sideways-imports nothing.

import type { Principal } from "@orb/contracts/identity";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  ConnectParams,
  CreateFromCharacterParams,
  CreatePersonaParams,
  DisconnectParams,
  DuplicatePersonaParams,
  ExportPersonaParams,
  GetPersonaParams,
  ImportPersonaParams,
  ListConnectedParams,
  ListPersonasParams,
  RemovePersonaParams,
  SetActivePersonaParams,
  UpdatePersonaParams,
} from "./params.ts";
import type { DisconnectResult, PersonaImportOutcome, PersonaPortableFile, RemovePersonaResult } from "./results.ts";
import type { PersonaDetail } from "./views.ts";

/** The DI bundle every persona verb closes over, wired at the composition root. */
export interface PersonaContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newPersonaId: () => PersonaId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** Fires `personasChanged` with the acting owner's `userId` after every persona-CRUD write commits, so a
   *  second device's list refetches. Fire-and-forget. */
  readonly emitUserEvent: EmitUserEvent;

  readonly requireChatAuthorOrHost: (principal: Principal, chatId: ChatId, targetUserId: UserId) => Promise<void>;
  readonly setChatActivePersona: (chatId: ChatId, targetUserId: UserId, personaId: PersonaId | null) => Promise<void>;
  /** Re-point the global seed pointers after `remove` deletes `deletedId`. Enforces "never no current
   *  persona while you own one": re-points to default → first remaining → null. No-op when neither pointer
   *  named the deleted id. Fires after the row deletion commits. */
  readonly repointSeedsAfterPersonaDelete: (ownerId: UserId, deletedId: PersonaId) => Promise<void>;
}

export interface PersonaService {
  /** Create a persona owned by the caller; returns the full detail (with joined avatar hash). */
  readonly create: (params: CreatePersonaParams) => Promise<PersonaDetail>;
  /** The caller's personas, newest first. Empty array when they have none. */
  readonly list: (params: ListPersonasParams) => Promise<PersonaDetail[]>;
  /** One owned persona by id. Throws {@link PersonaNotFoundError} when it doesn't exist OR isn't the
   *  caller's (the two collapse into one answer — no foreign-existence leak). */
  readonly get: (params: GetPersonaParams) => Promise<PersonaDetail>;
  /** Patch an owned persona (whitelisted fields; undefined skips). Returns the fresh detail. Throws
   *  {@link PersonaNotFoundError} when not owned/found. A no-op edit re-reads without writing. */
  readonly update: (params: UpdatePersonaParams) => Promise<PersonaDetail>;
  /** Delete an owned persona (the junction CASCADEs; `messages.personaId` SET NULL). Throws
   *  {@link PersonaNotFoundError} when not owned/found. */
  readonly remove: (params: RemovePersonaParams) => Promise<RemovePersonaResult>;
  /** Mint a persona from an owned character's card (copies name/description/avatar). When `swapMacros`,
   *  the description's `{{char}}`/`{{user}}` invert (persona POV). Stores `sourceCharacterId`/`swapMacros`
   *  provenance (non-lossy). Throws {@link PersonaCharacterNotFoundError} when the character isn't owned/found. */
  readonly createFromCharacter: (params: CreateFromCharacterParams) => Promise<PersonaDetail>;
  /** Connect a persona to a character (idempotent). Both must be owned by the caller. */
  readonly connectToCharacter: (params: ConnectParams) => Promise<void>;
  /** Remove a persona⇄character connection (idempotent — `disconnected:false` if already absent). */
  readonly disconnectFromCharacter: (params: DisconnectParams) => Promise<DisconnectResult>;
  /** Personas connected to this character, owner-scoped, newest first. */
  readonly listConnectedToCharacter: (params: ListConnectedParams) => Promise<PersonaDetail[]>;
  /** Set the active persona for a participant in a chat (host-or-self scoped). */
  readonly setActivePersona: (params: SetActivePersonaParams) => Promise<void>;
  /** Clone an owned persona into a fresh row (FINAL-Persona §A.6b gap #2) — name suffixed " (copy)",
   *  `starred` reset to false (a fresh identity, mirrors `character.duplicate`), `avatarAssetId`/`metadata`
   *  carried forward verbatim (re-pointing to the SAME asset is trivial — no new asset is minted). Throws
   *  {@link PersonaNotFoundError} when the source isn't owned/found. */
  readonly duplicate: (params: DuplicatePersonaParams) => Promise<PersonaDetail>;
  /** Read an owned persona as ONE portable file (excludes `avatarAssetId`). The bundle descriptor streams
   *  it and the single-entity export door serves the same bytes — one producer, no drift. Throws
   *  {@link PersonaNotFoundError} when not owned/found. */
  readonly export: (params: ExportPersonaParams) => Promise<PersonaPortableFile>;
  /** Restore ONE portable persona file (the `export` round-trip twin). Idempotent: a same-named persona is
   *  merged in place. Never throws for a malformed file — the refusal is a typed outcome the calling door
   *  renders. Never carries an avatar (re-attaching one after restore is a separate, explicit action). */
  readonly import: (params: ImportPersonaParams) => Promise<PersonaImportOutcome>;
}
