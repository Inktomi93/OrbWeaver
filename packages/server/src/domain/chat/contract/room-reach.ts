import type { LiveOnlyChatBusEvent, RoomEntityKind } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { CharacterId, ChatId, DocumentId, PersonaId, RegexScriptId, UserId, WorldBookId } from "@orb/kit/ids";
import type { Logger } from "#foundation/observability";

/** Reach is keyed by the entity's identity; the live event never carries that identity. */
export interface RoomEntityIdOf {
  readonly character: CharacterId;
  readonly persona: PersonaId;
  readonly "world-info": WorldBookId;
  readonly regex: RegexScriptId;
  readonly databank: DocumentId;
}

export type RoomReachResolvers = { readonly [K in RoomEntityKind]: (id: RoomEntityIdOf[K]) => Promise<ChatId[]> };

export interface RoomSeatReach {
  readonly character: RoomReachResolvers["character"];
  readonly persona: RoomReachResolvers["persona"];
  readonly member: (userId: UserId) => Promise<ChatId[]>;
}

/** Capture before junction teardown; consumers fan only after their owner-scoped write succeeds. */
export interface RoomDeleteReachCapture {
  readonly persona: (personaId: PersonaId) => Promise<() => void>;
  readonly "world-info": (bookId: WorldBookId) => Promise<() => void>;
  readonly regex: (scriptIds: readonly RegexScriptId[]) => Promise<(deleted: readonly RegexScriptId[]) => void>;
  readonly databank: (documentId: DocumentId) => Promise<() => void>;
}

export interface RoomEntityRefreshDeps {
  readonly logger: Logger;
  readonly resolve: RoomReachResolvers;
  readonly resolveRegexScripts: (scriptIds: readonly RegexScriptId[]) => Promise<Map<RegexScriptId, ChatId[]>>;
  readonly resolveMemberRooms: RoomSeatReach["member"];
  readonly emitRoomEvent: (event: LiveOnlyChatBusEvent) => void;
}

export interface RoomEntityRefresh {
  readonly deleteReachCapture: RoomDeleteReachCapture;
  readonly fanEntityEvent: (event: DomainEvent) => Promise<void>;
  readonly fanRegexScriptRooms: (scriptId: RegexScriptId) => Promise<void>;
  readonly fanDatabankDocumentRooms: (documentId: DocumentId) => Promise<void>;
  readonly fanDatabankCharacterRooms: (characterId: CharacterId) => Promise<void>;
  readonly fanDatabankMemberRooms: (ownerId: UserId) => Promise<void>;
}
