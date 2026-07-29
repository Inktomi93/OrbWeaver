// The committed-chat "This chat" tab section bodies — the two host-owned per-chat surfaces that wire their
// OWN mutation, referenced by settings-context-tab.tsx's sections instead of re-deriving the mutation.
// `RoomOverridesTab` is the Field-overrides section (the four-field autosave form); `ChatBackgroundSection`
// is the Background section (the per-chat decorative background source). Split apart so each is its own
// labeled Section in the consolidated tab (panel-redesign). `.catch` swallows the overrides autosave
// rejection so a failed write doesn't leak an unhandled page error — the mutation's own errorToast surfaces it.

import type { RoomOverrides } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
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
}

export function RoomOverridesTab({ chatId, roomOverrides, isHost }: RoomOverridesTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setOverrides = useSetRoomOverrides({ trpc, invalidation });
  const save = (overrides: RoomOverrides): Promise<unknown> => setOverrides.mutateAsync({ chatId, overrides }).catch(() => undefined);

  return (
    <RoomOverridesForm entityId={`${ROOM_OVERRIDES_ENTITY_PREFIX}${chatId}`} roomOverrides={roomOverrides} isHost={isHost} save={isHost ? save : undefined} />
  );
}

export interface ChatBackgroundSectionProps {
  readonly chatId: ChatId;
  readonly background: ThemeBackground | null;
}

/** The Background section body (host-only — the caller gates the whole Section on `isHost`). The picker
 *  writes the whole rebuilt source on every pick via `setChatBackground`. */
export function ChatBackgroundSection({ chatId, background }: ChatBackgroundSectionProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setBackground = useSetChatBackground({ trpc, invalidation });

  return (
    <BackgroundSourceField
      onChange={(next): void => {
        setBackground.mutate({ chatId, background: next });
      }}
      value={background}
    />
  );
}
