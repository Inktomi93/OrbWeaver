// The chat room surface: composes the message-thread anchor + message-list surface with the composer
// into one pane: [ thread (grows) | composer (pinned) ]. ChatHandle and draft text are local to this
// pane, not lifted further than they need to be. The tail-role read for continue-on-empty uses a
// separate useSuspenseQuery on the same listMessages key MessageListSurface already suspends on
// internally — one shared cache entry, not a second round-trip.

import type { ChatId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Stack } from "@orb/ui/layout";
import { ThemeScope } from "@orb/ui/theme-scope";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { ChatBusDeps } from "#data";
import { QueryBoundary, useGatedQuery, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import type { ActiveChatHandle, ChatHandle } from "#state";
import { committedChat, isCommitted } from "#state";
import { MessageThreadAnchor } from "../anchors/message-thread-anchor";
import { ChatCastBar } from "../components/chat-cast-bar";
import { Composer } from "../components/composer";
import { MessageSelectionBar } from "../components/message-selection-bar";
import type { DraftSeed } from "../hooks/use-send-message";
import { resolveRoomTheme } from "../lib/attribution";
import { MessageListSurface } from "./message-list-surface";

export interface ChatRoomSurfaceProps {
  readonly initialHandle: ActiveChatHandle;
  readonly busDeps: ChatBusDeps;
  readonly draftSeed?: DraftSeed | undefined;
  /** The second arg is the originating draft's key, so a late resolve after the user moved on can't
   *  hijack the ancestor's active slot. */
  readonly onChatStarted?: ((chatId: ChatId, draftKey: string) => void) | undefined;
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
}

export function ChatRoomSurface({
  initialHandle,
  busDeps,
  draftSeed,
  onChatStarted,
  onChatForked,
}: ChatRoomSurfaceProps): ReactElement {
  const [handle, setHandle] = useState<ChatHandle>(initialHandle);
  const [draftText, setDraftText] = useState("");
  const trpc = useTRPC();

  const onCommitted = (chatId: ChatId): void => {
    setHandle(committedChat(chatId));
    if (initialHandle.kind === "draft") {
      onChatStarted?.(chatId, initialHandle.draftKey);
    }
  };

  // Sole-character chrome takeover: in a true-solo room, that character's theme override wins at the
  // chat root; multi-human/group keeps the viewer's own theme (undefined here).
  const roomChatId = isCommitted(handle) ? handle.id : null;
  const { data: roomChat } = useGatedQuery(roomChatId, (id) =>
    trpc.chat.getChat.queryOptions({ chatId: id }),
  );
  const roomTheme = resolveRoomTheme(roomChat?.participants);

  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <ThemeScope tokens={roomTheme ?? {}} className="contents">
      <Stack
        gap="block"
        className="h-full px-block pb-block outline-none"
        ref={surfaceRef}
        tabIndex={-1}
      >
        {isCommitted(handle) ? <ChatCastBar chatId={handle.id} /> : null}
        <Stack className="min-h-0 flex-1">
          <MessageThreadAnchor>
            <MessageListSurface
              busDeps={busDeps}
              handle={handle}
              draftSeed={draftSeed}
              onChatForked={onChatForked}
            />
          </MessageThreadAnchor>
        </Stack>
        {isCommitted(handle) ? <MessageSelectionBar chatId={handle.id} /> : null}
        <ComposerSlot
          handle={handle}
          value={draftText}
          onChange={setDraftText}
          draftSeed={draftSeed}
          onCommitted={onCommitted}
        />
      </Stack>
    </ThemeScope>
  );
}

interface ComposerSlotProps {
  readonly handle: ChatHandle;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly draftSeed: DraftSeed | undefined;
  readonly onCommitted: (chatId: ChatId) => void;
}

function ComposerSlot(props: ComposerSlotProps): ReactElement {
  const chatId = isCommitted(props.handle) ? props.handle.id : null;
  if (chatId === null) {
    return <Composer {...props} tailRole={null} />;
  }
  return (
    <QueryBoundary
      fallback={<Composer {...props} tailRole={null} />}
      renderError={(): ReactElement => <Composer {...props} tailRole={null} />}
    >
      <ComposerTailGate {...props} chatId={chatId} />
    </QueryBoundary>
  );
}

function ComposerTailGate(props: ComposerSlotProps & { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data: messagesPage } = useSuspenseQuery(
    trpc.chat.listMessages.queryOptions({ chatId: props.chatId }),
  );
  const tailRole: MessageRole | null = messagesPage.messages.at(-1)?.role ?? null;
  return <Composer {...props} tailRole={tailRole} />;
}
