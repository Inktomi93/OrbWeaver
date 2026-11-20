// The room's stylesheet sources (`room-sheets.ts`) over the rows the transcript holds and the room's head. The head
// read rides only while the held rows lack the room's first row, so a long room's greeting still carries on load. It
// is a `chat.listMessages` key, so the canon invalidation every message key takes (`chatCanonReads`) refreshes it on a
// greeting swipe or edit. Non-suspending: until it lands the held rows are the sources.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { useGatedQuery, useTRPC } from "#data";
import type { RowRenderPolicy } from "#lib";
import type { RoomSheetRow, RoomSheetSource } from "../lib/room-sheets.ts";
import { ROOM_FIRST_SEQ, ROOM_HEAD_ROWS, roomSheetSources } from "../lib/room-sheets.ts";

const NO_ROWS: readonly MessageView[] = [];

export function useRoomSheetSources(
  chatId: ChatId,
  held: readonly MessageView[],
  policyOf: (row: RoomSheetRow) => Pick<RowRenderPolicy, "cardTier">,
): readonly RoomSheetSource[] {
  const trpc = useTRPC();
  const holdsHead = held.some((view) => view.seq === ROOM_FIRST_SEQ);
  const head = useGatedQuery(holdsHead ? null : chatId, (id) =>
    trpc.chat.listMessages.queryOptions({ chatId: id, cursor: { kind: "after", seq: ROOM_FIRST_SEQ - 1 }, limit: ROOM_HEAD_ROWS }),
  );
  return roomSheetSources([...held, ...(head.data?.messages ?? NO_ROWS)], policyOf);
}
