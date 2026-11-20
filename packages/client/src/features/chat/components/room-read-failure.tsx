// The open room's read failure, drawn by the transcript's boundary when the room's roster or its transcript read fails. A
// not-found answer never reaches it: that room is gone, and `useRoomRead` (`../hooks/use-room-read.ts`) leaves it for the chat
// list instead of offering a retry that could never succeed.
//
// It stands in the transcript's track with the opaque error plate: over room art the muted line and its Retry need the `card`
// backing their ink is floored against.

import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { QueryErrorState } from "#data";
import { CHAT_ROOM_READ_LABEL } from "../lib/chat-surface-names.ts";
import { Track } from "../lib/chat-track.tsx";

export function RoomReadFailure({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <Track of={Stack} track="chat">
      <QueryErrorState label={CHAT_ROOM_READ_LABEL} onRetry={onRetry} plate="error" />
    </Track>
  );
}
