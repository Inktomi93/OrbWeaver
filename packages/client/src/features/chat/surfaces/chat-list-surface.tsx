// The Chats-section LIST surface (UI-Arch §2.1 CONSUMER tier; §4.1/§4.2 LIST region) — the existing-chats
// picker that fills the shell's LIST panel: a header row (micro-caps "Chats" title + a compact ghost `+`
// icon-button → the J2 picker) → a search field → the caller's chats as `@orb/ui/list-row` rows
// (avatar · title · participants · relative time), select-to-open, with a per-row kebab (rename/star/
// archive/delete). UIP-301/302/303 + J5.
//
// READ SHAPE: `chat.listChats` returns a plain, UNPAGED `ChatSummary[]` — a `useSuspenseQuery` in
// `<QueryBoundary>` (the §13.2 bounded-read row), NOT `createCollectionSurface` (the infinite machine —
// wrong tool for a bounded array). No new invalidation is wired: `data/invalidation.ts` already refreshes
// `chat.listChats` on chat events + the J5 row mutations invalidate it, so the list stays fresh for free.
//
// SEARCH (UIP-303): a client-side `useDeferredValue` filter over the loaded summaries (title + participant
// names — `filterChats`, mirroring the character library's `filterCharacters`). `chat.listChats` has no
// server-side search param — a server search is a real domain change, out of scope (flagged in filter-chats).
//
// SELECTION: this surface only WRITES the choice out via `onSelect`/`onNewChat`/`onDeletedChat` — it holds
// no active-chat state and reads none (§5.1: no surface chases an ambient active chat). The route owns the
// active-chat store; `activeChatId` is passed down purely to paint the selected row.

import type { ChatId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the character-library-surface.tsx / rail-slots.ts precedent).
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { timeLib } from "#lib";
import { ChatListRowMenu } from "../components/chat-list-row-menu";
import { initialsForAttribution } from "../lib/attribution";
import { filterChats } from "../lib/filter-chats";

const SKELETON_ROW_COUNT = 5;

type ChatListRows = inferOutput<Trpc["chat"]["listChats"]>;
type ChatSummaryItem = ChatListRows[number];

export interface ChatListSurfaceProps {
  /** The active chat's id (or null for landing/draft) — paints the selected row; never a read source. */
  readonly activeChatId: ChatId | null;
  /** Open an existing chat (the route maps this to `selectChat`). */
  readonly onSelect: (chatId: ChatId) => void;
  /** Open the new-chat character picker (the route maps this to `openModal("newChat")`). */
  readonly onNewChat: () => void;
  /** Fired after a row's delete succeeds — the route leaves the room if it was the active one (J1). */
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
}

/** The chats picker: a header row (title + `+`) → search → the suspense-loaded rows. */
export function ChatListSurface({
  activeChatId,
  onSelect,
  onNewChat,
  onDeletedChat,
}: ChatListSurfaceProps): ReactElement {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query, "");
  const clearSearch = (): void => setQuery("");

  return (
    <Stack className="h-full min-h-0" gap="block">
      {/* Header row (UIP-202/302): the section title lives HERE (not in PanelChrome) + a compact ghost
          `+` icon-button (the demoted New-chat slab → the J2 picker). */}
      <Row align="center" justify="between">
        <Text size="micro" weight="semibold" tone="muted" transform="caps">
          Chats
        </Text>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button intent="ghost" size="icon" aria-label="Start a new chat" onClick={onNewChat}>
                <Icon icon={Plus} size="sm" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">New chat</TooltipPopup>
        </Tooltip>
      </Row>
      <Input
        aria-label="Search chats"
        onValueChange={setQuery}
        placeholder="Search the weave…"
        value={query}
      />
      <Stack className="min-h-0 flex-1">
        <QueryBoundary
          fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />}
          renderError={(_error, retry): ReactElement => (
            <QueryErrorState label="your chats" onRetry={retry} />
          )}
        >
          <ChatListBody
            activeChatId={activeChatId}
            onClearSearch={clearSearch}
            onDeletedChat={onDeletedChat}
            onNewChat={onNewChat}
            onSelect={onSelect}
            query={deferredQuery}
          />
        </QueryBoundary>
      </Stack>
    </Stack>
  );
}

interface ChatListBodyProps {
  readonly activeChatId: ChatId | null;
  readonly onSelect: (chatId: ChatId) => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
  readonly onNewChat: () => void;
  readonly onClearSearch: () => void;
  readonly query: string;
}

/** The suspending body — reads canon, filters client-side, then renders the empty-state or the row list. */
function ChatListBody({
  activeChatId,
  onSelect,
  onDeletedChat,
  onNewChat,
  onClearSearch,
  query,
}: ChatListBodyProps): ReactElement {
  const trpc = useTRPC();
  const { data: chats } = useSuspenseQuery(trpc.chat.listChats.queryOptions({}));

  if (chats.length === 0) {
    return (
      <EmptyState
        action={
          <Button intent="primary" onClick={onNewChat} size="sm">
            <Icon icon={Plus} size="sm" />
            New chat
          </Button>
        }
        description="Pick a character to start your first conversation."
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title="No chats yet"
      />
    );
  }

  const filtered = filterChats(chats, query);
  if (filtered.length === 0) {
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={onClearSearch} size="sm">
            Clear search
          </Button>
        }
        description={`No chat matches "${query}".`}
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title="No matches"
      />
    );
  }

  return (
    <Stack
      aria-label="Chats"
      className="h-full min-h-0 overflow-y-auto overscroll-contain"
      gap="row"
      role="list"
    >
      {filtered.map((chat) => (
        <ChatListRow
          chat={chat}
          key={chat.id}
          onDeletedChat={onDeletedChat}
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
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
}

/** One chats-list row — avatar (initials) · title · participants · relative time, plus the kebab menu. */
function ChatListRow({ chat, selected, onSelect, onDeletedChat }: ChatListRowProps): ReactElement {
  const title = chat.title ?? "Untitled chat";
  const subtitle =
    chat.participantNames.length > 0 ? chat.participantNames.join(", ") : "No characters";
  // ChatSummary carries no last-message preview text on the wire — TODO(server): add a preview field to
  // `ChatSummary` for a real last-line; today the participant names are the honest subtitle.
  const when = chat.lastMessageAt ?? chat.updatedAt;

  return (
    <ListRow
      actions={
        <Row align="center" gap="field">
          <Text className="whitespace-nowrap font-mono" size="micro" tone="muted">
            {timeLib.formatRelative(when)}
          </Text>
          <ChatListRowMenu
            archived={chat.archived}
            chatId={chat.id}
            onDeleted={onDeletedChat}
            starred={chat.star}
            title={chat.title}
          />
        </Row>
      }
      clickable={true}
      leading={
        <Avatar fallbackDelay={0} hueSeed={chat.id} size="sm">
          {initialsForAttribution(title)}
        </Avatar>
      }
      onClick={(): void => onSelect(chat.id)}
      selected={selected}
      subtitle={subtitle}
      title={title}
    />
  );
}
