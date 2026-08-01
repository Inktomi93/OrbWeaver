// The chats-list surface: a search field and the caller's chats as list-row rows
// (avatar/title/participants/relative time), select-to-open, with a per-row kebab menu. The title +
// count + New action live in the LIST chrome band now (`chat-list-header.tsx`, north-star §4 N2), not
// here. chat.listChats
// is a plain unpaged array, so this is a bounded useSuspenseQuery, not createCollectionSurface. Search
// is a client-side useDeferredValue filter — there is no server-side search param. Portraits (F7/D3) resolve
// HERE, not in the row: one non-blocking `character.list` read builds a characterId→seat map the rows index
// with their `participantCharacterIds` (one seat = a portrait, two or more = an AvatarStack). Reads its OWN
// selection (`useActiveChatId`) so the chats-section definition composing it stays a pure data object
// (the character/preset/world-info library-surface precedent); writes the choice out via
// onSelect/onNewChat/onDeletedChat.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, MessagesSquare, Plus, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import { FaceStrip } from "#components";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { chatsWithCharacter, useFocusOnMount } from "#lib";
import type { ChatListCharacterFilter } from "#state";
import { clearChatListCharacterFilter, setChatListCharacterFilter, useActiveChatId, useChatListCharacterFilter } from "#state";
import { ChatListRow } from "../components/chat-list-row";
import { useChatPortraitMap } from "../hooks/use-chat-portrait-map";
import type { ChatRowPortrait } from "../lib/chat-summary-row";
import { chatPortraits } from "../lib/chat-summary-row";
import { filterChats } from "../lib/filter-chats";
import { recentFaces } from "../lib/recent-faces";

type ChatSummaryItem = inferOutput<Trpc["chat"]["listChats"]>[number];

const SKELETON_ROW_COUNT = 5;

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
  const characterById = useChatPortraitMap();

  // Arm B — the faces strip: the pane learns FACES without the rail learning a new section. Tapping one
  // sets the LANDED per-character filter chip, so the same pane instantly becomes her threads, visibly
  // "filtered by" (a chip you can clear) rather than a second list that owns her chats.
  const faces = recentFaces(chats, characterById);
  const scopeToFace = (id: string): void => {
    const face = faces.find((candidate) => candidate.id === id);
    if (face === undefined) {
      return;
    }
    // Re-tapping the scoping face clears it — the same toggle its `aria-current` announces (the chip's ✕
    // stays the other way out).
    if (characterFilter?.id === id) {
      clearChatListCharacterFilter();
      return;
    }
    setChatListCharacterFilter({ id: castId<CharacterId>(id), name: face.name });
  };

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
  const filtered = filterChats(scoped, query);
  return (
    <Stack className="h-full min-h-0" gap="block">
      {/* The strip stays put across every body state below it — it is the way OUT of an empty scope. */}
      <FaceStrip items={faces} label="Recent characters" onSelect={scopeToFace} selectedId={characterFilter?.id ?? null} verb="Show chats with" />
      <Stack className="min-h-0 flex-1">
        <ChatRows
          activeChatId={activeChatId}
          characterById={characterById}
          characterFilter={characterFilter}
          filtered={filtered}
          onClearSearch={onClearSearch}
          onDeletedChat={onDeletedChat}
          onNewChat={onNewChat}
          onSelect={onSelect}
          query={query}
          scopedCount={scoped.length}
        />
      </Stack>
    </Stack>
  );
}

interface ChatRowsProps extends ChatListBodyProps {
  readonly characterById: ReadonlyMap<string, ChatRowPortrait>;
  readonly filtered: readonly ChatSummaryItem[];
  /** Rows left after the per-character scope, BEFORE the search — 0 means the scope itself is empty. */
  readonly scopedCount: number;
}

/** The scope-empty → search-empty → rows ladder under the faces strip. */
function ChatRows({
  activeChatId,
  characterById,
  characterFilter,
  filtered,
  onClearSearch,
  onDeletedChat,
  onNewChat,
  onSelect,
  query,
  scopedCount,
}: ChatRowsProps): ReactElement {
  if (characterFilter !== null && scopedCount === 0) {
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
          portraits={chatPortraits(chat.participantCharacterIds, characterById)}
          selected={chat.id === activeChatId}
        />
      ))}
    </Stack>
  );
}
