// THE chat keystone — the message-list surface (UI-Arch §2.1 CONSUMER tier; scout §"chat-surface").
// It COMPOSES the built seams — it never paints raw:
//   • reads canon (`MessageView[]`) via `useSuspenseQuery` over `trpc.chat.listMessages`, wrapped in
//     `<QueryBoundary>` (the loading/error battery — the EchoBoundaryStory canonical, §13.1);
//   • GATES the read on the ChatHandle discriminant: a draft (no server id) never mounts the query, so
//     no `castId("")` sentinel ever reaches the server (no-fake-disabled-id in spirit — the discriminant
//     is a stronger gate than skipToken);
//   • attaches the live room stream with `useChatBus(chatId, busDeps)` — `busDeps` is assembled at the
//     composition root (a feature may not import the write store, gate chat-stream-writes-in-bus-only);
//   • merges canon + the streaming ghost into ONE id-keyed list (`useMessageItems`) and renders it
//     through `@orb/ui/message-list` (anchorTo/followOnAppend hard-wired in the seal);
//   • subscribes ONLY to lifecycle (`useTurnPhase`) — token text stays inside the ONE ghost row, so a
//     delta never re-renders the list (the ghost-isolation invariant, §11.1).
//
// READ-PATH NOTE (deviation flagged for the coordinator): the plan/§13.2 prescribe `useGatedQuery`, but
// its `GatedOptions` type is INCOMPATIBLE with the current tRPC `queryOptions` return (TanStack v5.101
// key-typed `staleTime`/`queryFn` variance — a client-factory drift I surfaced as the first consumer,
// out of this file set). The equivalent-and-compiling path is the QueryBoundary + useSuspenseQuery
// canonical, gated by the ChatHandle discriminant. Swap back once `useGatedQuery` is realigned.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { MessageList } from "@orb/ui/message-list";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { ChatBusDeps } from "#data";
import { QueryBoundary, useChatBus, useTRPC } from "#data";
import type { ChatHandle } from "#state";
import { isCommitted, useTurnPhase } from "#state";
import { GhostMessageRow } from "../components/ghost-message-row";
import { MessageRow } from "../components/message-row";
import { useChatStyle } from "../hooks/use-chat-style";
import { messageItemKey, useMessageItems } from "../hooks/use-message-items";
import type { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";

/** Initial per-row height guess (px) — rows re-measure themselves after mount (the seal's job). */
const ESTIMATED_ROW_PX = 96;

export interface MessageListSurfaceProps {
  readonly handle: ChatHandle;
  /** The reducer deps, assembled at the composition root (stream + invalidate + onWarning). */
  readonly busDeps: ChatBusDeps;
  /** Navigate to a forked chat (threaded to each row's Fork action) — route maps it to `selectChat`. */
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
}

/** The scrolling chat transcript for one chat (or an empty draft). */
export function MessageListSurface({
  handle,
  busDeps,
  onChatForked,
}: MessageListSurfaceProps): ReactElement {
  const chatId = isCommitted(handle) ? handle.id : null;
  useChatBus(chatId, busDeps);
  const chatStyle = useChatStyle();

  // Draft: no server row yet → no read, no live stream. The discriminant IS the gate.
  if (chatId === null) {
    return <EmptyThread />;
  }
  return (
    <QueryBoundary
      fallback={<LoadingRows />}
      renderError={(_error, retry): ReactElement => <ErrorState onRetry={retry} />}
    >
      <ChatThread chatId={chatId} chatStyle={chatStyle} onChatForked={onChatForked} />
    </QueryBoundary>
  );
}

interface ChatThreadProps {
  readonly chatId: ChatId;
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
}

/** The committed-chat transcript — suspends on the canon read, then merges the live ghost. */
function ChatThread({ chatId, chatStyle, onChatForked }: ChatThreadProps): ReactElement {
  const trpc = useTRPC();
  const { data: messages } = useSuspenseQuery(trpc.chat.listMessages.queryOptions({ chatId }));
  const phase = useTurnPhase(chatId);
  const items = useMessageItems(messages, chatId);

  const live = phase === "pending" || phase === "streaming";
  // The tail assistant message is the swipe-eligible row (hidden mid-stream — scout swipe-strip rule).
  const lastAssistantId = live ? null : findLastAssistantId(messages);

  const renderItem = (item: (typeof items)[number]): ReactNode =>
    item.kind === "ghost" ? (
      <GhostMessageRow chatId={chatId} chatStyle={chatStyle} streaming={phase === "streaming"} />
    ) : (
      <MessageRow
        message={item.view}
        chatStyle={chatStyle}
        showSwipes={item.view.id === lastAssistantId}
        onChatForked={onChatForked}
      />
    );

  if (items.length === 0) {
    return <EmptyThread />;
  }
  return (
    <MessageList
      items={items}
      getItemKey={messageItemKey}
      estimateSize={(): number => ESTIMATED_ROW_PX}
      renderItem={renderItem}
      gapToken="block"
      className="h-full"
    />
  );
}

/** The newest assistant message's id (drives swipe-strip visibility), or null for none. */
function findLastAssistantId(messages: readonly MessageView[]): MessageView["id"] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m !== undefined && m.role === "assistant") {
      return m.id;
    }
  }
  return null;
}

/** The empty-transcript state (a draft, or a committed chat with no messages). */
function EmptyThread(): ReactElement {
  return (
    <Stack align="center" justify="center" padding="section" className="h-full">
      <Text tone="muted">No messages yet.</Text>
    </Stack>
  );
}

/** The suspense-free loading skeleton (a few placeholder rows, never a spinner flash). */
function LoadingRows(): ReactElement {
  return (
    <Stack gap="block" padding="section" className="h-full">
      <Skeleton variant="text" className="h-block w-full" />
      <Skeleton variant="text" className="h-block w-3/4" />
      <Skeleton variant="text" className="h-block w-5/6" />
    </Stack>
  );
}

/** The read-error surface — the QueryBoundary retry actually refetches (the reset handshake). */
function ErrorState({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <Stack gap="row" align="center" justify="center" padding="section" className="h-full">
      <Text tone="muted">Couldn't load this conversation.</Text>
      <Button intent="ghost" onClick={onRetry}>
        Retry
      </Button>
    </Stack>
  );
}
