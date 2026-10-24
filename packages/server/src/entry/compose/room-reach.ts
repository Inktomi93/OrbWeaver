// Assemble owner reach queries and chat's room-plane policies; all handed-out rules live in their domains.
import type { LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import type { DatabaseHandle } from "@orb/db/wiring";
import { createEmitRoomEntityChanged, createRoomEntityRefresh, createRoomSeatReach } from "#domain/chat";
import { createDatabankRoomReach } from "#domain/databank";
import { createRegexRoomReach } from "#domain/regex";
import { createWorldInfoRoomReach } from "#domain/world-info";
import type { Logger } from "#foundation/observability";

function buildRoomRefresh(
  db: DatabaseHandle,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
  logger: Logger,
): ReturnType<typeof createRoomEntityRefresh> {
  const seats = createRoomSeatReach(db);
  const regex = createRegexRoomReach(db);
  return createRoomEntityRefresh({
    logger,
    resolve: {
      character: seats.character,
      persona: seats.persona,
      "world-info": createWorldInfoRoomReach(db),
      regex: regex.script,
      databank: createDatabankRoomReach(db),
    },
    resolveRegexScripts: regex.scripts,
    resolveMemberRooms: seats.member,
    emitRoomEvent,
  });
}

export function createRoomEntityFan(
  db: DatabaseHandle,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
  logger: Logger,
): ReturnType<typeof createRoomEntityRefresh>["fanEntityEvent"] {
  return buildRoomRefresh(db, emitRoomEvent, logger).fanEntityEvent;
}

export function createDeleteReachCapture(
  db: DatabaseHandle,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
  logger: Logger,
): ReturnType<typeof createRoomEntityRefresh>["deleteReachCapture"] {
  return buildRoomRefresh(db, emitRoomEvent, logger).deleteReachCapture;
}

export function createEmitRoomRegexChanged(emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): ReturnType<typeof createEmitRoomEntityChanged> {
  return createEmitRoomEntityChanged(emitRoomEvent, "regex");
}

export function createEmitRoomDatabankChanged(emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): ReturnType<typeof createEmitRoomEntityChanged> {
  return createEmitRoomEntityChanged(emitRoomEvent, "databank");
}

export function createFanRegexScriptRooms(
  db: DatabaseHandle,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
  logger: Logger,
): ReturnType<typeof createRoomEntityRefresh>["fanRegexScriptRooms"] {
  return buildRoomRefresh(db, emitRoomEvent, logger).fanRegexScriptRooms;
}

export function createFanDatabankDocumentRooms(
  db: DatabaseHandle,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
  logger: Logger,
): ReturnType<typeof createRoomEntityRefresh>["fanDatabankDocumentRooms"] {
  return buildRoomRefresh(db, emitRoomEvent, logger).fanDatabankDocumentRooms;
}

export function createFanDatabankCharacterRooms(
  db: DatabaseHandle,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
  logger: Logger,
): ReturnType<typeof createRoomEntityRefresh>["fanDatabankCharacterRooms"] {
  return buildRoomRefresh(db, emitRoomEvent, logger).fanDatabankCharacterRooms;
}

export function createFanDatabankMemberRooms(
  db: DatabaseHandle,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
  logger: Logger,
): ReturnType<typeof createRoomEntityRefresh>["fanDatabankMemberRooms"] {
  return buildRoomRefresh(db, emitRoomEvent, logger).fanDatabankMemberRooms;
}
