// The Chats-section LIST surface (UI-Arch §2.1 CONSUMER tier; §4.1 LIST region) — the existing-chats
// picker that fills the shell's LIST panel for the Chats section: a "New chat" button + the caller's
// chats, newest-updated-first, select-to-open.
//
// READ SHAPE: `chat.listChats` returns a plain, UNPAGED `ChatSummary[]` (not the `{items,nextCursor}`
// keyset shape `character.list` uses) — so this is a `useSuspenseQuery` in `<QueryBoundary>` (the §13.2
// row for a bounded read), NOT `createCollectionSurface` (which is the infinite-query machine — wrong
// tool for a bounded array; virtualizing a membership list this size would be reaching for a primitive
// the data shape doesn't need). No new invalidation is wired: `data/invalidation.ts` already refreshes
// `chat.listChats` on `chatCreated`/send/fork events, so a newly-started chat appears here for free.
//
// SELECTION: this surface only WRITES the choice out via `onSelect` — it holds no active-chat state and
// reads none (UI-Arch §5.1: no surface chases an ambient active chat). The route owns the active-chat
// store and passes `activeChatId` down purely to paint the selected row; the click calls `onSelect`,
// which the route maps to `selectChat` (the same action the character card + Fork-nav land on).

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the character-library-surface.tsx / rail-slots.ts precedent).
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, useTRPC } from "#data";

const SKELETON_ROW_COUNT = 5;

type ChatListRows = inferOutput<Trpc["chat"]["listChats"]>;
type ChatSummaryItem = ChatListRows[number];

export interface ChatListSurfaceProps {
  /** The active chat's id (or null for a draft/none) — paints the selected row; never a read source. */
  readonly activeChatId: ChatId | null;
  /** Open an existing chat (the route maps this to `selectChat`). */
  readonly onSelect: (chatId: ChatId) => void;
  /** Start a fresh draft chat (the route maps this to `startNewChat`). */
  readonly onNewChat: () => void;
}

/** The chats picker: a New-chat button + the suspense-loaded existing-chats list. */
export function ChatListSurface({
  activeChatId,
  onSelect,
  onNewChat,
}: ChatListSurfaceProps): ReactElement {
  return (
    <Stack className="h-full min-h-0" gap="block">
      <Button intent="primary" onClick={onNewChat} aria-label="Start a new chat">
        <Icon icon={Plus} size="sm" />
        New chat
      </Button>
      <Stack className="min-h-0 flex-1">
        <QueryBoundary
          fallback={<LoadingRows />}
          renderError={(_error, retry): ReactElement => <ErrorState onRetry={retry} />}
        >
          <ChatListBody activeChatId={activeChatId} onSelect={onSelect} />
        </QueryBoundary>
      </Stack>
    </Stack>
  );
}

interface ChatListBodyProps {
  readonly activeChatId: ChatId | null;
  readonly onSelect: (chatId: ChatId) => void;
}

/** The suspending body — reads canon then renders the empty-state or the row list. */
function ChatListBody({ activeChatId, onSelect }: ChatListBodyProps): ReactElement {
  const trpc = useTRPC();
  const { data: chats } = useSuspenseQuery(trpc.chat.listChats.queryOptions({}));

  if (chats.length === 0) {
    return (
      <EmptyState
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title="No chats yet"
        description="Pick a character to start your first conversation."
      />
    );
  }

  return (
    <Stack aria-label="Chats" className="h-full min-h-0 overflow-y-auto" gap="row" role="list">
      {chats.map((chat) => (
        <ChatListRow
          key={chat.id}
          chat={chat}
          onSelect={onSelect}
          selected={chat.id === activeChatId}
        />
      ))}
    </Stack>
  );
}

interface ChatListRowProps {
  readonly chat: ChatSummaryItem;
  readonly selected: boolean;
  readonly onSelect: (chatId: ChatId) => void;
}

/** One chats-list row — title + the participant names, select-to-open. */
function ChatListRow({ chat, selected, onSelect }: ChatListRowProps): ReactElement {
  const title = chat.title ?? "Untitled chat";
  const subtitle =
    chat.participantNames.length > 0 ? chat.participantNames.join(", ") : "No characters";

  return (
    <Card
      aria-pressed={selected}
      data-selected={selected ? "" : undefined}
      interactive={true}
      onClick={(): void => onSelect(chat.id)}
      padding="block"
    >
      <Row align="center" gap="row">
        <Stack className="min-w-0 flex-1" gap="field">
          <Text as="span" className="truncate" weight="semibold">
            {title}
          </Text>
          <Text as="span" className="truncate" size="label" tone="muted">
            {subtitle}
          </Text>
        </Stack>
      </Row>
    </Card>
  );
}

/** The suspense-free loading skeleton (a few placeholder rows, never a spinner flash). */
function LoadingRows(): ReactElement {
  return (
    <Stack aria-busy={true} gap="row" padding="block">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => i).map((i) => (
        <Skeleton className="h-control-lg w-full" key={i} />
      ))}
    </Stack>
  );
}

/** The read-error surface — the QueryBoundary retry actually refetches (the reset handshake). */
function ErrorState({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <Stack align="center" gap="row" justify="center" padding="section">
      <Text tone="muted">Couldn't load your chats.</Text>
      <Button intent="ghost" onClick={onRetry}>
        Retry
      </Button>
    </Stack>
  );
}
