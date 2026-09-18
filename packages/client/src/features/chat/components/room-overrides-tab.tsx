// The committed-chat "This chat" tab section bodies — the two host-owned per-chat surfaces that wire their
// OWN mutation, referenced by settings-context-tab.tsx's sections instead of re-deriving the mutation.
// `RoomOverridesTab` is the Field-overrides section (the four-field autosave form); `ChatBackgroundSection`
// is the Background section (the per-chat decorative background source). Split apart so each is its own
// labeled Section in the consolidated tab. `.catch` swallows the overrides autosave
// rejection so a failed write doesn't leak an unhandled page error — the mutation's own errorToast surfaces it.

import type { RoomOverrides } from "@orb/contracts/chat";
import { resolveCarriedBackground } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { BackgroundSourceField } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { RoomOverridesForm } from "../components/room-overrides-form.tsx";
import { useSetChatBackground, useSetRoomOverrides } from "../hooks/use-context-panel-mutations.ts";
import { ROOM_OVERRIDES_ENTITY_PREFIX } from "../lib/room-overrides-form-model.ts";

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

/** How a carried source NAMES itself in the provenance gloss. Every source that can PERSIST and reach here
 *  is `kind:"asset"` — the card author's own background, whose library NAME is not on this wire (it lives in
 *  THEIR appearance library), so it is described rather than invented. That covers the bundled scene plates
 *  too since `kind:"seeded"` retired (2026-09-18): a plate is one of the author's own library entries now,
 *  not a catalog slug this surface could look a label up for. `none`/`external` never reach here (the
 *  cascade drops `none`; `external` cannot persist — the BG-C invariant). */
const CARRIED_SOURCE_LABEL = "an uploaded image";

/** The Background section body (host-only — the caller gates the whole Section on `isHost`). The picker
 *  writes the whole rebuilt source on every pick via `setChatBackground`.
 *
 *  HONEST ECHO (owner-reported 08-03): the picker's value is the CHAT-SET field alone, so in a room painting
 *  its character's CARD-carried background the row read a flat "None" while the pixels said otherwise. The
 *  gloss below states the EFFECTIVE source + its origin, resolved through the SAME
 *  `resolveCarriedBackground` cascade the app-shell paints from — one truth, two renderings (the S4
 *  override-echoed-as-default class). A non-suspending read of the tab's already-warm `getChat` entry (the
 *  `InjectionsHeading` idiom): this section carries no QueryBoundary, so it must never suspend. */
export function ChatBackgroundSection({ chatId, background }: ChatBackgroundSectionProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setBackground = useSetChatBackground({ trpc, invalidation });
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const carried = resolveCarriedBackground(chat?.participants, background);

  return (
    <Stack gap="field">
      <BackgroundSourceField
        onChange={(next): void => {
          setBackground.mutate({ chatId, background: next });
        }}
        reserveKey="chat.roomOverrides.background"
        value={background}
      />
      {carried?.arm === "card-carried" ? (
        <Text voice="gloss">
          Painting {CARRIED_SOURCE_LABEL} — from {carried.characterName}'s card. Pick one here to override it.
        </Text>
      ) : null}
    </Stack>
  );
}
