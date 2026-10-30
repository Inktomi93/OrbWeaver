import type { LiveOnlyChatBusEvent, RoomEntityKind } from "@orb/contracts/chat";
import type { CaptureDatabankRoomReachOp } from "@orb/contracts/databank";
import type { DomainEvent } from "@orb/contracts/events";
import type { CapturePersonaRoomReachOp } from "@orb/contracts/persona";
import type { CaptureRegexRoomReachOp, ResolveRegexScriptRoomsOp } from "@orb/contracts/regex";
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
  readonly persona: CapturePersonaRoomReachOp;
  readonly "world-info": (bookId: WorldBookId) => Promise<() => void>;
  readonly regex: CaptureRegexRoomReachOp;
  readonly databank: CaptureDatabankRoomReachOp;
}

export interface RoomEntityRefreshDeps {
  readonly logger: Logger;
  readonly resolve: RoomReachResolvers;
  readonly resolveRegexScripts: ResolveRegexScriptRoomsOp;
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
