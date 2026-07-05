// The chat ROOM surface (UI-Arch §2.1/§4) — composes the already-built message-thread anchor +
// message-list surface with the composer into one coherent chat pane: `[ thread (grows) | composer
// (pinned) ]`. This is the ONE place the transcript + the input meet; the composition root above it
// (unbuilt — the app-shell CONTENT region, a later task) just mounts `<ChatRoomSurface>` with a
// `ChatId`/draft key and the bus deps.
//
// State ownership (UI-Arch §5.1 "surfaces own their own state"): the `ChatHandle` and the composer's
// draft text are LOCAL to this pane (`useState`, seeded from props) — not lifted further than they
// need to be. `initialHandle` promotes draft→committed via `onCommitted` (fired by the composer once
// `chat.startChat` resolves); `onChatStarted` lets an ancestor (e.g. the chat list's selection) learn
// about it too, without this pane chasing an ambient "active chat" global (no `this_chid` re-coupling).
//
// Continue-on-empty needs the transcript's TAIL role (composer.tsx's `tailRole` prop) — this surface
// reads it via a SEPARATE `useSuspenseQuery` on the exact same `trpc.chat.listMessages` key
// `MessageListSurface` already suspends on internally; same queryKey = one shared cache entry, not a
// second network round-trip (the intended TanStack Query multi-subscriber pattern, not a duplicate
// fetch) — the alternative would require editing `message-list-surface.tsx` to thread the tail out,
// which is out of this lane's file set (owned/read-only per the build brief).

import type { ChatId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { ChatBusDeps } from "#data";
import { QueryBoundary, useTRPC } from "#data";
import type { ChatHandle } from "#state";
import { committedChat, isCommitted } from "#state";
import { MessageThreadAnchor } from "../anchors/message-thread-anchor";
import { Composer } from "../components/composer";
import type { DraftSeed } from "../hooks/use-send-message";
import { MessageListSurface } from "./message-list-surface";

export interface ChatRoomSurfaceProps {
  readonly initialHandle: ChatHandle;
  readonly busDeps: ChatBusDeps;
  /** New-chat seed for the draft→committed path — see `DraftSeed` (hooks/use-send-message.ts). */
  readonly draftSeed?: DraftSeed | undefined;
  /** Fires once a draft chat is promoted to a committed one (e.g. so a chat-list ancestor can select
   *  it) — this pane already updates its OWN handle regardless of whether a caller supplies this. */
  readonly onChatStarted?: ((chatId: ChatId) => void) | undefined;
  /** Navigate to a forked chat (a message row's Fork) — threaded to the transcript; the route maps it
   *  to the active-chat store's `selectChat` (the unified fork-nav landing, §5.1). */
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
}

/** The composed chat pane: the scrolling transcript + the pinned composer. */
export function ChatRoomSurface({
  initialHandle,
  busDeps,
  draftSeed,
  onChatStarted,
  onChatForked,
}: ChatRoomSurfaceProps): ReactElement {
  const [handle, setHandle] = useState<ChatHandle>(initialHandle);
  const [draftText, setDraftText] = useState("");

  const onCommitted = (chatId: ChatId): void => {
    setHandle(committedChat(chatId));
    onChatStarted?.(chatId);
  };

  return (
    <Stack gap="block" className="h-full">
      <Stack className="min-h-0 flex-1">
        <MessageThreadAnchor>
          <MessageListSurface busDeps={busDeps} handle={handle} onChatForked={onChatForked} />
        </MessageThreadAnchor>
      </Stack>
      <ComposerSlot
        handle={handle}
        value={draftText}
        onChange={setDraftText}
        draftSeed={draftSeed}
        onCommitted={onCommitted}
      />
    </Stack>
  );
}

interface ComposerSlotProps {
  readonly handle: ChatHandle;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly draftSeed: DraftSeed | undefined;
  readonly onCommitted: (chatId: ChatId) => void;
}

/** Gate the tail-role read on the ChatHandle discriminant (mirrors `MessageListSurface`'s own gate) —
 *  a draft renders the composer with `tailRole={null}` and never reads the server. */
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

/** The ONE `useSuspenseQuery` call — same key `MessageListSurface` reads, shared cache (see header). */
function ComposerTailGate(props: ComposerSlotProps & { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data: messages } = useSuspenseQuery(
    trpc.chat.listMessages.queryOptions({ chatId: props.chatId }),
  );
  const tailRole: MessageRole | null = messages.at(-1)?.role ?? null;
  return <Composer {...props} tailRole={tailRole} />;
}
