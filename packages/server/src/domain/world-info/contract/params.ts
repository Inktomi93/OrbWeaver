// domain/world-info/contract/params — every verb's *Params, declared ONCE. Every verb carries the resolved
// principal; ownership scopes off principal.userId, never a users read. Chat verbs' authority is the
// injected chat-guard ops (requireChatHost for attach/detach, requireChatMember for list); world-info
// never reads the chat roster itself.

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

interface WorldInfoActorParams {
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
  /** Position 0 = first/highest priority. Stale/foreign ids silently dropped; absent entries keep their priority. */
  readonly orderedEntryIds: readonly WorldEntryId[];
}

export interface AttachToCharacterParams extends WorldInfoActorParams {
  readonly characterId: CharacterId;
  readonly bookId: WorldBookId;
  /** primary enforces at-most-one-per-character atomically; auxiliary is layered. */
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

export interface AttachToChatParams extends WorldInfoActorParams {
  readonly chatId: ChatId;
  readonly bookId: WorldBookId;
}

export interface DetachFromChatParams extends WorldInfoActorParams {
  readonly chatId: ChatId;
  readonly bookId: WorldBookId;
}

export interface ListForChatParams extends WorldInfoActorParams {
  readonly chatId: ChatId;
}
