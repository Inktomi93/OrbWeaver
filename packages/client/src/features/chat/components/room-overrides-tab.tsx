// The committed-chat Overrides tab body — wraps RoomOverridesForm with its OWN autosave-mutation wiring
// (extracted from chat-context-panel-surface.tsx so the declarative CONTEXT port, chats-section.tsx, has
// one tab body to reference instead of re-deriving the mutation; `.catch` swallows the autosave
// rejection so a failed write doesn't leak an unhandled page error — the mutation's own errorToast
// already surfaces it).

import type { RoomOverrides } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { RoomOverridesForm } from "../components/room-overrides-form";
import { useSetRoomOverrides } from "../hooks/use-context-panel-mutations";
import { ROOM_OVERRIDES_ENTITY_PREFIX } from "../lib/room-overrides-form-model";

export interface RoomOverridesTabProps {
  readonly chatId: ChatId;
  readonly roomOverrides: RoomOverrides;
  readonly isHost: boolean;
}

export function RoomOverridesTab({
  chatId,
  roomOverrides,
  isHost,
}: RoomOverridesTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setOverrides = useSetRoomOverrides({ trpc, invalidation });
  const save = (overrides: RoomOverrides): Promise<unknown> =>
    setOverrides.mutateAsync({ chatId, overrides }).catch(() => undefined);

  return (
    <RoomOverridesForm
      entityId={`${ROOM_OVERRIDES_ENTITY_PREFIX}${chatId}`}
      roomOverrides={roomOverrides}
      isHost={isHost}
      save={isHost ? save : undefined}
    />
  );
}
