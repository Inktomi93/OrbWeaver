// The chats-list surface: a search field and the caller's chats as list-row rows
// (avatar/title/participants/relative time), select-to-open, with a per-row kebab menu. The title +
// count + New action live in the LIST chrome band now (`chat-list-header.tsx`, north-star §4 N2), not
// here. chat.listChats
// is a plain unpaged array, so this is a bounded useSuspenseQuery, not createCollectionSurface. Search
// is a client-side useDeferredValue filter — there is no server-side search param. Portraits (F7) resolve
// HERE, not in the row: one non-blocking `character.list` read builds a characterId→avatarHash map the rows
// index with their `participantCharacterIds`. Reads its OWN
// selection (`useActiveChatId`) so the chats-section definition composing it stays a pure data object
// (the character/preset/world-info library-surface precedent); writes the choice out via
// onSelect/onNewChat/onDeletedChat.

import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, MessagesSquare, Plus, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { chatsWithCharacter, useFocusOnMount } from "#lib";
import type { ChatListCharacterFilter } from "#state";
import { clearChatListCharacterFilter, useActiveChatId, useChatListCharacterFilter } from "#state";
import { ChatListRowMenu } from "../components/chat-list-row-menu";
import { ChatSummaryRow } from "../components/chat-summary-row";
import { useStarChat } from "../hooks/use-chat-row-mutations";
import { chatPortraitHash, deriveChatTitle } from "../lib/chat-summary-row";
import { filterChats } from "../lib/filter-chats";

const SKELETON_ROW_COUNT = 5;
/** The portrait-map read (F7): one page of the character library, wide enough to cover any list a user can
 *  actually scan. A plain `useQuery` — the portraits are decoration, so a slow/failed character read must
 *  never block or error the chats list; those rows simply keep their initials blob. */
const PORTRAIT_MAP_LIMIT = 200;

type ChatListRows = inferOutput<Trpc["chat"]["listChats"]>;
type ChatSummaryItem = ChatListRows[number];

export interface ChatListSurfaceProps {
  readonly onSelect: (chatId: ChatId) => void;
  readonly onNewChat: () => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
}

export function ChatListSurface({ onSelect, onNewChat, onDeletedChat }: ChatListSurfaceProps): ReactElement {
  const activeChatId = useActiveChatId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query, "");
  const clearSearch = (): void => setQuery("");
  const characterFilter = useChatListCharacterFilter();
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack className="h-full min-h-0 outline-none" gap="block" ref={surfaceRef} tabIndex={-1}>
      {characterFilter !== null ? <FilterChip filter={characterFilter} /> : null}
      <Input aria-label="Search chats" onValueChange={setQuery} placeholder="Search the weave…" value={query} />
      <Stack className="min-h-0 flex-1">
        <QueryBoundary
          fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="your chats" onRetry={retry} />}
        >
          <ChatListBody
            activeChatId={activeChatId}
            characterFilter={characterFilter}
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

function FilterChip({ filter }: { readonly filter: ChatListCharacterFilter }): ReactElement {
  return (
    <Row align="center" gap="field">
      <Text size="micro" tone="muted" transform="caps">
        Filtered:
      </Text>
      <Badge intent="info" size="sm" tone="soft">
        {filter.name}
      </Badge>
      <Button aria-label={`Clear the ${filter.name} filter`} intent="ghost" onClick={clearChatListCharacterFilter} size="icon" type="button">
        <Icon icon={X} size="sm" />
      </Button>
    </Row>
  );
}

interface ChatListBodyProps {
  readonly activeChatId: ChatId | null;
  readonly characterFilter: ChatListCharacterFilter | null;
  readonly onSelect: (chatId: ChatId) => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
  readonly onNewChat: () => void;
  readonly onClearSearch: () => void;
  readonly query: string;
}

function ChatListBody({ activeChatId, characterFilter, onSelect, onDeletedChat, onNewChat, onClearSearch, query }: ChatListBodyProps): ReactElement {
  const trpc = useTRPC();
  const { data: chats } = useSuspenseQuery(trpc.chat.listChats.queryOptions({}));
  const characters = useQuery(trpc.character.list.queryOptions({ limit: PORTRAIT_MAP_LIMIT }));
  const avatarHashById = new Map((characters.data?.items ?? []).map((character) => [character.id, character.avatarHash] as const));

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

  const scoped = characterFilter === null ? chats : chatsWithCharacter(chats, characterFilter.id);
  if (characterFilter !== null && scoped.length === 0) {
    return (
      <EmptyState
        action={
          <Button intent="primary" onClick={onNewChat} size="sm">
            <Icon icon={Plus} size="sm" />
            New chat
          </Button>
        }
        description={`No chats with ${characterFilter.name} yet. Start one, or clear the filter.`}
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title="No matches"
      />
    );
  }

  const filtered = filterChats(scoped, query);
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
    <Stack aria-label="Chats" className="h-full min-h-0 overflow-y-auto overscroll-contain" gap="row" role="list">
      {filtered.map((chat) => (
        <ChatListRow
          chat={chat}
          key={chat.id}
          onDeletedChat={onDeletedChat}
          onSelect={onSelect}
          portraitHash={chatPortraitHash(chat.participantCharacterIds, avatarHashById)}
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
  /** The row's resolved participant portrait (F7) — null keeps the initials blob. */
  readonly portraitHash: string | null;
}

function ChatListRow({ chat, selected, onSelect, onDeletedChat, portraitHash }: ChatListRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // §12.2 — the row's ONE state toggle rides the SAME `useStarChat` mutation the kebab's Star item fires
  // (mirror parity: the kebab keeps the item, so a keyboard user still has one menu that does everything).
  const starChat = useStarChat({ trpc, invalidation });
  return (
    <ChatSummaryRow
      chat={chat}
      onToggleStar={(next): void => starChat.mutate({ chatId: chat.id, star: next })}
      portraitHash={portraitHash}
      // `group` roots the row so the kebab's hover/focus-within reveal (P3) fires on row hover (the
      // character-card precedent); the reveal lives on RowActionsMenu's `reveal`.
      className="group"
      // The DERIVED display title (participant names when unauthored) names the kebab menu ("Chat actions
      // for <title>") so the per-row menus are distinguishable, not N identical "Chat actions" (finding #4).
      // `title` (raw, nullable) still seeds the rename input — the empty box for an unnamed chat is intact.
      menu={
        <ChatListRowMenu
          archived={chat.archived}
          chatId={chat.id}
          displayTitle={deriveChatTitle(chat.title, chat.participantNames)}
          onDeleted={onDeletedChat}
          starred={chat.star}
          title={chat.title}
        />
      }
      onSelect={onSelect}
      selected={selected}
    />
  );
}
