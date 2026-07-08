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
  /** The room's opening handle — `committed | draft` ONLY (`landing` EXCLUDED by the type): the route
   *  renders `ChatLandingSurface` for a landing handle, so this surface never mounts with one. */
  readonly initialHandle: ActiveChatHandle;
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
  const trpc = useTRPC();

  const onCommitted = (chatId: ChatId): void => {
    setHandle(committedChat(chatId));
    onChatStarted?.(chatId);
  };

  // Layer 2 — the sole-character CHROME takeover (D44 §12.1). Read the committed roster (the warm
  // getChat cache the cast bar/message list already hold; a draft has no server roster) and, for a
  // TRUE-SOLO room only, apply that character's override at the chat root. Multi-human/group → undefined
  // → the room keeps the viewer's own Layer-1 theme. Nested inside the app-root Layer-1 <ThemeScope>, so
  // the character's set fields win here while unset fields inherit the viewer's global theme (cascade).
  const roomChatId = isCommitted(handle) ? handle.id : null;
  const { data: roomChat } = useGatedQuery(roomChatId, (id) =>
    trpc.chat.getChat.queryOptions({ chatId: id }),
  );
  const roomTheme = resolveRoomTheme(roomChat?.participants);

  // A11y focus restoration: when the chat room mounts, focus its main container.
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
        {/* The cast bar (task #29) — a read-only group-roster glance strip above the transcript; it
          size-gates itself to `null` for a solo (≤1-character) chat, and only reads a COMMITTED chat's
          roster (a draft has no server roster yet). */}
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
        {/* Bulk-select bar (J6) — pinned above the composer while select mode is on (renders null otherwise);
          only a COMMITTED chat has server messages to select. */}
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
  // `chat.listMessages` returns `MessagesPage { messages, macroNames }` (Chat-Macro-Resolution.md
  // §1/§3) — this read only needs the tail role, never the macro-name producer.
  const { data: messagesPage } = useSuspenseQuery(
    trpc.chat.listMessages.queryOptions({ chatId: props.chatId }),
  );
  const tailRole: MessageRole | null = messagesPage.messages.at(-1)?.role ?? null;
  return <Composer {...props} tailRole={tailRole} />;
}
