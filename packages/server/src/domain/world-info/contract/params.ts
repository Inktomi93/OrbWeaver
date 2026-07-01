// domain/world-info/contract/params — every verb's *Params, declared ONCE (§7.4 — one type home). The wire
// INPUT shapes (`CreateBookInput`/`UpdateBookInput`/`CreateEntryInput`/`UpdateEntryInput`) are
// cross-boundary (the client form + the tRPC router validate the SAME zod schema), so their home is
// `@orb/contracts/world-info`; they are re-exported here TYPE-ONLY so the verb signatures + the front door
// reference one name. The runtime schemas are NOT re-exported (the transport imports them from
// `@orb/contracts` directly) — keeping this a pure-type file (no `z.object` → no contract-test obligation
// here; the schemas are tested in `tests/contracts/world-info/`).
//
// Every verb carries the resolved `principal` (spine §7.1) — ownership is scoped off `principal.userId`,
// the single source of truth for "whose rows" (NEVER a `users` read — the `no-direct-users-read` gate). A
// book/entry is owned via `worldBooks.ownerId`; an attachment target (character/persona) is gated by its
// own owner column (a sanctioned schema read).
//
// FLAG[PD-30] — the chat scope. The three chat-attachment verbs (`attachToChat`/`detachFromChat`/
// `listForChat`) and their params are NOT here: chats are membership-scoped (D18 — NO `chats.ownerId`), so
// their authority is the host participant via the `can({ kind: 'chat', roster })` arm (now BUILT — PD-1
// done); the block is the chat roster/membership data world-info doesn't own (Phase-5).
// Building them now would collapse the chat tier into world-info. See service.ts for the full DEFER note.

import type { Principal } from "@orb/contracts/identity";
import type {
  CreateBookInput,
  CreateEntryInput,
  UpdateBookInput,
  UpdateEntryInput,
  WorldBookRole,
} from "@orb/contracts/world-info";
import type { CharacterId, PersonaId, WorldBookId, WorldEntryId } from "@orb/kit/ids";

export type {
  CreateBookInput,
  CreateEntryInput,
  UpdateBookInput,
  UpdateEntryInput,
} from "@orb/contracts/world-info";

/** Common to every world-info verb: the acting principal whose `userId` scopes ownership. */
export interface WorldInfoActorParams {
  readonly principal: Principal;
}

// ── Books ──────────────────────────────────────────────────────────────────
export interface ListBooksParams extends WorldInfoActorParams {}

export interface GetBookParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
}

export interface CreateBookParams extends WorldInfoActorParams {
  readonly input: CreateBookInput;
}

export interface UpdateBookParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
  readonly input: UpdateBookInput;
}

export interface RemoveBookParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
}

export interface DuplicateBookParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
}

// ── Entries ────────────────────────────────────────────────────────────────
export interface ListEntriesParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
}

export interface GetEntryParams extends WorldInfoActorParams {
  readonly entryId: WorldEntryId;
}

export interface CreateEntryParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
  readonly input: CreateEntryInput;
}

export interface UpdateEntryParams extends WorldInfoActorParams {
  readonly entryId: WorldEntryId;
  readonly input: UpdateEntryInput;
}

export interface RemoveEntryParams extends WorldInfoActorParams {
  readonly entryId: WorldEntryId;
}

export interface BackfillTitlesParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
}

export interface ApplyEntryOrderParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
  /** The entry ids in display order (position 0 = first / highest priority). Stale or foreign ids are
   *  silently dropped; entries in the book but absent from this list keep their existing priority. */
  readonly orderedEntryIds: readonly WorldEntryId[];
}

// ── Attachments — character ──────────────────────────────────────────────────
export interface AttachToCharacterParams extends WorldInfoActorParams {
  readonly characterId: CharacterId;
  readonly bookId: WorldBookId;
  /** `primary` enforces at-most-one-per-character atomically (demote+upsert batch); `auxiliary` is layered. */
  readonly role: WorldBookRole;
}

export interface DetachFromCharacterParams extends WorldInfoActorParams {
  readonly characterId: CharacterId;
  readonly bookId: WorldBookId;
}

export interface ListForCharacterParams extends WorldInfoActorParams {
  readonly characterId: CharacterId;
}

// ── Attachments — global ─────────────────────────────────────────────────────
export interface AttachGlobalParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
}

export interface DetachGlobalParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
}

export interface ListGlobalParams extends WorldInfoActorParams {}

// ── Attachments — persona ────────────────────────────────────────────────────
export interface AttachToPersonaParams extends WorldInfoActorParams {
  readonly personaId: PersonaId;
  readonly bookId: WorldBookId;
}

export interface DetachFromPersonaParams extends WorldInfoActorParams {
  readonly personaId: PersonaId;
  readonly bookId: WorldBookId;
}

export interface ListForPersonaParams extends WorldInfoActorParams {
  readonly personaId: PersonaId;
}
