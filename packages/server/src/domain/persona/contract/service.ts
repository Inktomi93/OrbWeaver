// domain/persona/contract/service — the typed API surface (read THIS to know everything the domain does).
// Holds:
//   • PersonaContext   the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4 /
//                      no-context-returntype; re-exported via context.ts, assembled at
//                      `entry/compose/services.ts`)
//   • PersonaService   the verb interface (the front door re-exports the type)
//
// The human's persona cards — owner-scoped CRUD + the character⇄persona junction + the non-lossy
// createFromCharacter mint. Every verb gates on `principal.userId` (ownership IS the gate — no admin/owner
// guard is injected; there is no privileged persona surface in W1). Cross-feature deps arrive type-only;
// persona sideways-imports nothing (domain-no-cross-feature).
//
// NOTE — `setActivePersona` writes `chat_participants.activePersonaId` (a chat-domain table)
// and is host-or-self, which routes through the `{ kind: 'chat', roster }` `can()` arm.
// It is fully wired into `PersonaService` and `entry/compose` supplies the chat database update ops.

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  ConnectParams,
  CreateFromCharacterParams,
  CreatePersonaParams,
  DisconnectParams,
  GetPersonaParams,
  ListConnectedParams,
  ListPersonasParams,
  RemovePersonaParams,
  SetActivePersonaParams,
  UpdatePersonaParams,
} from "./params";
import type { DisconnectResult, RemovePersonaResult } from "./results";
import type { PersonaDetail } from "./views";

/**
 * The DI bundle every persona verb closes over (wired at `service.ts`). Explicit interface (not
 * `ReturnType<typeof createPersonaContext>`) per §7.4 + the `no-context-returntype` gate.
 *   - `db` — the libSQL handle (all queries route through `persistence/`).
 *   - `now` — the INJECTED clock (epoch-ms). Production passes the real clock at `entry/`; tests the frozen
 *     clock. No ambient `Date.now()` in a verb (determinism — `test-determinism`).
 *   - `newPersonaId` — the INJECTED id minter (production `mintTypeId(ID_PREFIX.persona)`; tests the seeded
 *     generator). No ambient `mintTypeId()` in a verb (the same determinism seam).
 *   - `audit` — `foundation/observability`'s `logAudit`, pre-bound to `db` at the root (best-effort; the
 *     verb supplies the timestamp from `now`).
 */
export interface PersonaContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newPersonaId: () => PersonaId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;

  readonly requireChatAuthorOrHost: (
    principal: Principal,
    chatId: ChatId,
    targetUserId: UserId,
  ) => Promise<void>;
  readonly setChatActivePersona: (
    chatId: ChatId,
    targetUserId: UserId,
    personaId: PersonaId | null,
  ) => Promise<void>;
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
}
