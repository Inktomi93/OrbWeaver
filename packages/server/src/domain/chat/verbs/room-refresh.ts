// Room freshness is id-free and live-only; capture failures never reject the write they protect.
import type { LiveOnlyChatBusEvent, RoomEntityKind } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { ChatId, RegexScriptId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { RoomEntityRefresh, RoomEntityRefreshDeps } from "../contract/room-reach.ts";

function fanTo(emitRoomEvent: (event: LiveOnlyChatBusEvent) => void, entity: RoomEntityKind, rooms: readonly ChatId[]): void {
  for (const chatId of new Set(rooms)) {
    emitRoomEvent({ type: "roomEntityChanged", chatId, entity });
  }
}

async function captureRooms(
  resolve: () => Promise<ChatId[]>,
  entity: RoomEntityKind,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
): Promise<() => void> {
  const rooms = await resolve().catch((err: unknown): ChatId[] => {
    getLog().warn({ err, entity }, "room-reach: pre-write delete capture failed; the delete proceeds unannounced");
    return [];
  });
  return (): void => {
    fanTo(emitRoomEvent, entity, rooms);
  };
}

async function captureRegexScriptRooms(
  resolve: RoomEntityRefreshDeps["resolveRegexScripts"],
  scriptIds: readonly RegexScriptId[],
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
): Promise<(deleted: readonly RegexScriptId[]) => void> {
  const byScript = await resolve(scriptIds).catch((err: unknown): Map<RegexScriptId, ChatId[]> => {
    getLog().warn({ err, entity: "regex" }, "room-reach: pre-write delete capture failed; the delete proceeds unannounced");
    return new Map();
  });
  return (deleted): void => {
    fanTo(
      emitRoomEvent,
      "regex",
      deleted.flatMap((scriptId) => byScript.get(scriptId) ?? []),
    );
  };
}

function resolveRoomsOrNone(resolve: () => Promise<ChatId[]>, key: string): Promise<ChatId[]> {
  return resolve().catch((err: unknown): ChatId[] => {
    getLog().warn({ err, entity: "databank", key }, "room-reach: databank reach lookup failed; the write proceeds unannounced");
    return [];
  });
}

function assertNeverEvent(event: never): never {
  throw new Error(`room-reach: unhandled domain event: ${JSON.stringify(event)}`);
}

/** Bind a direct room-junction refresh without manufacturing a reach lookup for an already-known room. */
export function createEmitRoomEntityChanged(emitRoomEvent: RoomEntityRefreshDeps["emitRoomEvent"], entity: RoomEntityKind): (chatId: ChatId) => void {
  return (chatId): void => fanTo(emitRoomEvent, entity, [chatId]);
}

/** Compose room-plane policies over owner queries; the event bus supervises the content subscriber. */
export function createRoomEntityRefresh(deps: RoomEntityRefreshDeps): RoomEntityRefresh {
  const { emitRoomEvent } = deps;
  const fanEntityEvent: RoomEntityRefresh["fanEntityEvent"] = async (event: DomainEvent): Promise<void> => {
    switch (event.type) {
      case "character.updated":
        // EVERY card edit, `contentChanged` or not: a co-member's open room must hear a theme/flag change too
        // (the embeddings indexer is the consumer that filters on `contentChanged`, for a different reason).
        fanTo(emitRoomEvent, "character", await deps.resolve.character(event.characterId));
        return;
      case "persona.updated":
        fanTo(emitRoomEvent, "persona", await deps.resolve.persona(event.personaId));
        return;
      case "world-info.updated":
        fanTo(emitRoomEvent, "world-info", await deps.resolve["world-info"](event.bookId));
        return;
      case "asset.created":
        // NO ROOM REACH, deliberately: an asset is content-addressed and immutable, so a STORE creates bytes
        // nobody was already rendering. The room-visible consequence of an avatar change is the character /
        // persona row's `avatarAssetId` pointer moving, which arrives as that entity's own `.updated` event.
        return;
      default:
        return assertNeverEvent(event);
    }
  };

  return {
    fanEntityEvent,
    deleteReachCapture: {
      persona: (personaId) => captureRooms(() => deps.resolve.persona(personaId), "persona", emitRoomEvent),
      "world-info": (bookId) => captureRooms(() => deps.resolve["world-info"](bookId), "world-info", emitRoomEvent),
      regex: (scriptIds) => captureRegexScriptRooms(deps.resolveRegexScripts, scriptIds, emitRoomEvent),
      databank: (documentId) => captureRooms(() => deps.resolve.databank(documentId), "databank", emitRoomEvent),
    },
    fanRegexScriptRooms: async (scriptId): Promise<void> => {
      const rooms = await deps.resolve.regex(scriptId).catch((err: unknown): ChatId[] => {
        getLog().warn({ err, scriptId }, "room-reach: regex script reach lookup failed; the write proceeds unannounced");
        return [];
      });
      fanTo(emitRoomEvent, "regex", rooms);
    },
    fanDatabankDocumentRooms: async (documentId): Promise<void> => {
      fanTo(emitRoomEvent, "databank", await resolveRoomsOrNone(() => deps.resolve.databank(documentId), "document"));
    },
    fanDatabankCharacterRooms: async (characterId): Promise<void> => {
      fanTo(emitRoomEvent, "databank", await resolveRoomsOrNone(() => deps.resolve.character(characterId), "character"));
    },
    fanDatabankMemberRooms: async (ownerId): Promise<void> => {
      fanTo(emitRoomEvent, "databank", await resolveRoomsOrNone(() => deps.resolveMemberRooms(ownerId), "member"));
    },
  };
}
