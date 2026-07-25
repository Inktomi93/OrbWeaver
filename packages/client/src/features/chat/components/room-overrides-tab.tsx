// The committed-chat Overrides tab body — wraps RoomOverridesForm with its OWN autosave-mutation wiring,
// referenced by chats-section.tsx's declarative CONTEXT tab instead of re-deriving the mutation; `.catch`
// swallows the autosave rejection so a failed write doesn't leak an unhandled page error — the mutation's
// own errorToast already surfaces it.

import type { RoomOverrides } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { BackgroundSourceField } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { RoomOverridesForm } from "../components/room-overrides-form";
import { useSetChatBackground, useSetRoomOverrides } from "../hooks/use-context-panel-mutations";
import { ROOM_OVERRIDES_ENTITY_PREFIX } from "../lib/room-overrides-form-model";

export interface RoomOverridesTabProps {
  readonly chatId: ChatId;
  readonly roomOverrides: RoomOverrides;
  readonly isHost: boolean;
  readonly background: ThemeBackground | null;
}

export function RoomOverridesTab({ chatId, roomOverrides, isHost, background }: RoomOverridesTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setOverrides = useSetRoomOverrides({ trpc, invalidation });
  const setBackground = useSetChatBackground({ trpc, invalidation });
  const save = (overrides: RoomOverrides): Promise<unknown> => setOverrides.mutateAsync({ chatId, overrides }).catch(() => undefined);

  return (
    <Stack gap="section">
      <RoomOverridesForm entityId={`${ROOM_OVERRIDES_ENTITY_PREFIX}${chatId}`} roomOverrides={roomOverrides} isHost={isHost} save={isHost ? save : undefined} />
      {isHost ? (
        <BackgroundSourceField
          onChange={(next): void => {
            setBackground.mutate({ chatId, background: next });
          }}
          value={background}
        />
      ) : null}
    </Stack>
  );
}
