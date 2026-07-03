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
// The CHAT scope (PD-30 cleared): chats are MEMBERSHIP-scoped (D18 — NO `chats.ownerId`), so the chat
// verbs' authority is the injected chat-guard ops on `WorldInfoContext` (`requireChatHost` for the
// attach/detach room-config writes, `requireChatMember` for the list read) — world-info never reads the
// roster itself (domain-no-cross-feature; the ops are wired from chat's guards at the composition root).

import type { Principal } from "@orb/contracts/identity";
import type {
  CreateBookInput,
  CreateEntryInput,
  UpdateBookInput,
  UpdateEntryInput,
  WorldBookRole,
} from "@orb/contracts/world-info";
import type { CharacterId, ChatId, PersonaId, WorldBookId, WorldEntryId } from "@orb/kit/ids";

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

export interface AttachGlobalParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
}

export interface DetachGlobalParams extends WorldInfoActorParams {
  readonly bookId: WorldBookId;
}

export interface ListGlobalParams extends WorldInfoActorParams {}

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

/** Attach a caller-OWNED book to a chat room (host authority — room-wide prompt content). */
export interface AttachToChatParams extends WorldInfoActorParams {
  readonly chatId: ChatId;
  readonly bookId: WorldBookId;
}

/** Detach a book from a chat room (host authority; idempotent). */
export interface DetachFromChatParams extends WorldInfoActorParams {
  readonly chatId: ChatId;
  readonly bookId: WorldBookId;
}

/** The books attached to a chat the caller is a PRESENT member of (room-public prompt content). */
export interface ListForChatParams extends WorldInfoActorParams {
  readonly chatId: ChatId;
}
