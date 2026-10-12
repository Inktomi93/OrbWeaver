// entry/compose/visible-rooms — wires chat's leak-safe reverse-room read (`createResolveVisibleRooms`) with
// sessions' handle read, once, for every seam that hands it to a library domain (regex, databank, preset).

import type { ResolveVisibleRoomsOp } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { createResolveVisibleRooms } from "#domain/chat";
import { selectHandlesByIds } from "#domain/sessions";

export function createVisibleRoomsReader(db: Db): ResolveVisibleRoomsOp {
  return createResolveVisibleRooms({ db }, (userIds) => selectHandlesByIds(db, userIds));
}
