// Assemble owner reach queries and chat's room-plane policies; all handed-out rules live in their domains.
import type { LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { createEmitRoomEntityChanged, createRoomEntityRefresh, createRoomSeatReach } from "#domain/chat";
import { createDatabankRoomReach } from "#domain/databank";
import { createRegexRoomReach } from "#domain/regex";
import { createWorldInfoRoomReach } from "#domain/world-info";

function buildRoomRefresh(db: Db, emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): ReturnType<typeof createRoomEntityRefresh> {
  const seats = createRoomSeatReach(db);
  const regex = createRegexRoomReach(db);
  return createRoomEntityRefresh({
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
  db: Db,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
): ReturnType<typeof createRoomEntityRefresh>["fanEntityEvent"] {
  return buildRoomRefresh(db, emitRoomEvent).fanEntityEvent;
}

export function createDeleteReachCapture(
  db: Db,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
): ReturnType<typeof createRoomEntityRefresh>["deleteReachCapture"] {
  return buildRoomRefresh(db, emitRoomEvent).deleteReachCapture;
}

export function createEmitRoomRegexChanged(emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): ReturnType<typeof createEmitRoomEntityChanged> {
  return createEmitRoomEntityChanged(emitRoomEvent, "regex");
}

export function createEmitRoomDatabankChanged(emitRoomEvent: (event: LiveOnlyChatBusEvent) => void): ReturnType<typeof createEmitRoomEntityChanged> {
  return createEmitRoomEntityChanged(emitRoomEvent, "databank");
}

export function createFanRegexScriptRooms(
  db: Db,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
): ReturnType<typeof createRoomEntityRefresh>["fanRegexScriptRooms"] {
  return buildRoomRefresh(db, emitRoomEvent).fanRegexScriptRooms;
}

export function createFanDatabankDocumentRooms(
  db: Db,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
): ReturnType<typeof createRoomEntityRefresh>["fanDatabankDocumentRooms"] {
  return buildRoomRefresh(db, emitRoomEvent).fanDatabankDocumentRooms;
}

export function createFanDatabankCharacterRooms(
  db: Db,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
): ReturnType<typeof createRoomEntityRefresh>["fanDatabankCharacterRooms"] {
  return buildRoomRefresh(db, emitRoomEvent).fanDatabankCharacterRooms;
}

export function createFanDatabankMemberRooms(
  db: Db,
  emitRoomEvent: (event: LiveOnlyChatBusEvent) => void,
): ReturnType<typeof createRoomEntityRefresh>["fanDatabankMemberRooms"] {
  return buildRoomRefresh(db, emitRoomEvent).fanDatabankMemberRooms;
}
