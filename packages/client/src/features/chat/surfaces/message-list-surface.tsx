// THE chat keystone — the message-list surface (UI-Arch §2.1 CONSUMER tier; scout §"chat-surface").
// It COMPOSES the built seams — it never paints raw:
//   • reads canon (`MessagesPage`) + the roster (`chat.getChat`, see below) via
//     `useSuspenseQueries`, wrapped in `<QueryBoundary>` (the loading/error battery — the
//     EchoBoundaryStory canonical, §13.1);
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
// ROSTER + MACRO-PRODUCER THREADING (the `{{char}}`/`{{user}}` macro + #21 attribution wiring):
// `MessageRow` ACCEPTS `participants`/`characterNamesById`/`personaNamesById`/`activePersonaId` — the
// roster read lives HERE, alongside `listMessages`, via `useSuspenseQueries` (PLURAL — two suspense
// reads in one component would otherwise serially waterfall, UI-Lib-TanStack-Query.md §"request
// waterfalls"). `chat.listMessages` now returns `MessagesPage { messages, macroNames }` (Chat-Macro-
// Resolution.md §1/§3, its return shape CHANGED from a bare `MessageView[]`); `chat.getChat`'s
// `ChatDetail` carries the roster (`participants`) + its OWN `macroNames` floor (participant-scoped).
// The client MERGES both `ChatMacroNameProducer`s (`@orb/contracts/chat`'s `buildCharacterNameMap`/
// `buildPersonaNameMap`, last-write-wins on a dup id) into the two lookup maps `resolveRowMacros`
// (`@orb/kit/macro`) wants — covering every participant PLUS this page's own stamped ids (a
// since-switched persona). The owner-scoped `persona.list` read is GONE: the member-gated producer
// replaced it (that read was the cross-owner bug — Chat-Macro-Resolution.md). A draft (no committed
// chatId) never reaches this component at all (see the discriminant gate below), so no roster read
// happens for the empty-thread path.
//
// READ-PATH NOTE (deviation flagged for the coordinator): the plan/§13.2 prescribe `useGatedQuery`, but
// its `GatedOptions` type is INCOMPATIBLE with the current tRPC `queryOptions` return (TanStack v5.101
// key-typed `staleTime`/`queryFn` variance — a client-factory drift I surfaced as the first consumer,
// out of this file set). The equivalent-and-compiling path is the QueryBoundary + useSuspenseQuery
// canonical, gated by the ChatHandle discriminant. Swap back once `useGatedQuery` is realigned.

import type { ChatMacroNameProducer, MessageView } from "@orb/contracts/chat";
import { buildCharacterNameMap, buildPersonaNameMap } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { MessageList } from "@orb/ui/message-list";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { ChatBusDeps } from "#data";
import { QueryBoundary, useChatBus, useTRPC } from "#data";
import type { ChatHandle } from "#state";
import { isCommitted, isLiveTurnPhase, useTurnPhase } from "#state";
import { GhostMessageRow } from "../components/ghost-message-row";
import { MessageRow } from "../components/message-row";
import { useChatStyle } from "../hooks/use-chat-style";
import { useMessageAppearance } from "../hooks/use-message-appearance";
import { messageItemKey, useMessageItems } from "../hooks/use-message-items";
import type { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import { buildParticipantsById, resolveViewerActivePersonaId } from "../lib/roster";

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

/** The committed-chat transcript — suspends on the canon + roster reads, then merges the live ghost. */
function ChatThread({ chatId, chatStyle, onChatForked }: ChatThreadProps): ReactElement {
  const trpc = useTRPC();
  // ONE `useSuspenseQueries` (plural) — two suspense reads, fetched in parallel (see header note).
  const [{ data: messagesPage }, { data: chatDetail }] = useSuspenseQueries({
    queries: [
      trpc.chat.listMessages.queryOptions({ chatId }),
      trpc.chat.getChat.queryOptions({ chatId }),
    ],
  });
  const messages = messagesPage.messages;
  const participants = buildParticipantsById(chatDetail.participants);
  // The client's OWN merge of the two `ChatMacroNameProducer` wire halves (header note): the chat-level
  // floor ∪ this page's own stamped ids, last-write-wins on a dup id (contracts' own doc on the builders).
  const producers: readonly ChatMacroNameProducer[] = [
    chatDetail.macroNames,
    messagesPage.macroNames,
  ];
  const characterNamesById = buildCharacterNameMap(producers.flatMap((p) => p.characterNames));
  const personaNamesById = buildPersonaNameMap(producers.flatMap((p) => p.personaNames));
  const activePersonaId = resolveViewerActivePersonaId(chatDetail.participants);
  // Per-message avatar chrome from the synced appearance pref (§12.1) — read ONCE here, threaded to
  // each row as props (rows stay prop-driven + Compiler-memoized, never a per-row query).
  const messageAppearance = useMessageAppearance();
  const phase = useTurnPhase(chatId);
  const items = useMessageItems(messages, chatId);

  const live = isLiveTurnPhase(phase);
  // The tail assistant message is the swipe-eligible row (hidden mid-stream — scout swipe-strip rule).
  const lastAssistantId = live ? null : findLastAssistantId(messages);

  const renderItem = (item: (typeof items)[number]): ReactNode =>
    item.kind === "ghost" ? (
      <GhostMessageRow
        chatId={chatId}
        chatStyle={chatStyle}
        streaming={phase === "streaming" || phase === "stopping"}
      />
    ) : (
      <MessageRow
        message={item.view}
        chatStyle={chatStyle}
        avatarSize={messageAppearance.avatarSize}
        avatarShape={messageAppearance.avatarShape}
        showInChatAvatars={messageAppearance.showInChatAvatars}
        showSwipes={item.view.id === lastAssistantId}
        participants={participants}
        characterNamesById={characterNamesById}
        personaNamesById={personaNamesById}
        activePersonaId={activePersonaId}
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
