// The chats-list surface: a search field and the caller's chats as list-row rows
// (avatar/title/participants/relative time), select-to-open, with a per-row kebab menu. The title +
// count + New action live in the LIST chrome band now (`chat-list-header.tsx`, north-star §4 N2), not
// here.
//
// PAGED + VIRTUALIZED (2026-08-09). `chat.listChats` is a keyset page, read through the shared
// `useChatListCollection`, and the rows render into the sealed `<VirtualList>` — an 880-chat library used to
// arrive as one array and paint one DOM row per chat. Two consequences the copy has to be honest about:
//   • The per-character scope is a SERVER filter now (`characterId` on the query), not a client `.filter()`
//     over the whole library — so scoping to a character costs one bounded read instead of pulling
//     everything to keep three rows.
//   • SEARCH is a SERVER param too (owner ruling 2026-08-09), not a client pass over the loaded pages: a
//     client filter over a keyset list can only ever search what it has fetched, so "no matches" would have
//     been a claim the surface had no standing to make. It carries the 2026-08-01 semantics whole — title OR
//     a character seat's name OR the newest message's body — over the active server scope. The value is
//     DEBOUNCED, not just deferred: deferring picks a render, and every distinct string here is a round trip.
//
// Portraits (F7/D3) arrive resolved on each row (one seat = a portrait, two or more = an AvatarStack).
// Reads its OWN selection (`useActiveChatId`) so the chats-section definition
// composing it stays a pure data object (the character/preset/world-info library-surface precedent); writes
// the choice out via onSelect/onNewChat/onDeletedChat.
//
// BOTH `new chat` DOORS STAY — the ONE ruled exception to "never two doors at once" (#1361 item 2, owner
// 2026-09-05). The Characters precedent (`character/components/character-create-actions.tsx`) is the general
// law: the landing there mints doors ONLY in the arm where the band's are off screen, because two doors on
// one plane is the more-than-one-home IA class. This pane is the exception the owner ruled: the LIST band's
// `New` is a chrome affordance whose kicker supplies the noun (#864's band idiom, so it reads "New" and not
// "New chat"), and the EMPTY state's `New chat` is the only thing on an otherwise empty pane — an empty pane
// that dead-ends is the defect the empty-state action rule exists to stop, and it is the arm where the
// band's button is 300px of nothing away from the eye that is reading "No chats yet". They are the same
// handler and they can never mint differently.
//
// NO ALLOWANCE ROW IS MINTED FOR IT, and that is a receipt rather than an omission. The family has two
// enforcement halves and NEITHER pairs these doors: the STATIC gate (`duplicate-action-doors`) censuses tRPC
// MUTATION call sites per rail section, and both doors reach the room through `openNewChatPicker` /
// `useStartChat` in `#data` — zero call sites inside `features/chat`, so a row in its `EXEMPT_PROCEDURES`
// would grant nothing and its own stale-exemption arm would RED it; the RUNTIME half (design-audit's
// `duplicate-action-door`) groups by `role|accessible name` and has no allowance table at all, and "New" and
// "New chat" are different names, so it never pairs them either. The ruling therefore lives HERE and in
// `hooks/use-chat-list-header.tsx` — at both doors, so neither can be "tidied away" as the odd one out.
//
// THE THREE NARROWING AXES ARE STORE STATE, NOT LOCAL STATE (#490 — `state/chat-list-filter-store.ts`). The
// per-character filter always was; search and month joined it, because the LIST CHROME BAND that prints the
// census (`hooks/use-chat-list-header.tsx`) feeds a different shell slot and could not see a `useState`
// here — which is how `CHATS 896` came to sit above twelve filtered rows. The faces strip + "Filtered: X ✕"
// chip live in `components/chat-list-character-filter.tsx` (the 450-line cap; this file composes them).

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { VirtualList } from "@orb/ui/virtual-list";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { ListPage } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useGatedQuery, useTRPC } from "#data";
import { ESTIMATED_ROW_PX, NO_MATCHES_TITLE, SEARCH_DEBOUNCE_MS, useDebouncedValue, useFocusListArrival } from "#lib";
import type { ChatListCharacterFilter } from "#state";
import {
  clearChatListCharacterFilter,
  setChatListMonth,
  setChatListSearch,
  useActiveChatId,
  useChatListCharacterFilter,
  useChatListMonth,
  useChatListSearch,
  useMobileViewport,
} from "#state";
import { ChatListFacesStrip, ChatListFilterChip } from "../components/chat-list-character-filter.tsx";
import { FilterExits } from "../components/chat-list-filter-exits.tsx";
import { ClearFilterGlyph } from "../components/chat-list-filter-field.tsx";
import { ChatListMonthFilter } from "../components/chat-list-month-filter.tsx";
import { ChatListPhoneFilters } from "../components/chat-list-phone-filters.tsx";
import { ChatListRow } from "../components/chat-list-row.tsx";
import { useChatListCollection } from "../hooks/use-chat-list-collection.ts";
import { useChatListRowActions } from "../hooks/use-chat-row-mutations.ts";
import type { FilterExit } from "../lib/chat-list-scope.ts";
import {
  activeFilterExits,
  chatListScopeKey,
  formatMonthLabel,
  monthEmptyDescription,
  monthExclusiveUpperBound,
  searchEmptyDescription,
} from "../lib/chat-list-scope.ts";
import { chatRowQualifiers, chatTitleQualifiers } from "../lib/chat-summary-row.ts";
import { CHAT_CLEAR_SEARCH_NAME, CHAT_LIST_EMPTY_TITLE, CHAT_LIST_NAME, CHAT_SEARCH_NAME } from "../lib/chat-surface-names.ts";

/** The list row, derived off the wire (the `chat-list-row.tsx` / `chat-summary-row.ts` spelling) — the
 *  collection hook deliberately exports no second name for it. */
type ChatListItem = inferOutput<Trpc["chat"]["listChats"]>["items"][number];

const SKELETON_ROW_COUNT = 5;

// THE MONTH BOUND LIVES IN ITS OWN COMPONENT (`components/chat-list-month-filter.tsx`) since #1350 — the
// direction ruling (#490/#1348) and the native-picker record (#500/#522) are stated there, at the code that
// carries them. The FOLD is no longer that component's: since #1718 arm A a phone puts BOTH secondary
// filters behind ONE `ChatListPhoneFilters` row, and this surface picks the arm.
const SKIP_TO_LIST_LABEL = "Skip to chats";
const SEARCH_LABEL = CHAT_SEARCH_NAME;
const CLEAR_SEARCH_LABEL = CHAT_CLEAR_SEARCH_NAME;

export interface ChatListSurfaceProps {
  readonly onSelect: (chatId: ChatId) => void;
  readonly onNewChat: () => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
}

export function ChatListSurface({ onSelect, onNewChat, onDeletedChat }: ChatListSurfaceProps): ReactElement {
  const activeChatId = useActiveChatId();
  // BOTH NARROWING AXES ARE STORE STATE NOW (#490) — see `chat-list-filter-store.ts` for why: the chrome
  // band is a sibling shell region and cannot read this component's `useState`, which is how `CHATS 896`
  // came to sit above twelve rows.
  const query = useChatListSearch();
  const month = useChatListMonth();
  const beforeRecencyAt = monthExclusiveUpperBound(month);
  const monthLabel = formatMonthLabel(month);
  const settledQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const clearSearch = (): void => setChatListSearch("");
  const clearMonth = (): void => setChatListMonth("");
  const characterFilter = useChatListCharacterFilter();
  // The shell's published viewport regime — which of the two filter ARMS this pane composes (#1718 arm A).
  // Not a mobile mode: the same two controls, in the same order, behind a disclosure only where the pane is
  // the whole screen and the pixels have to be bought back.
  const isMobile = useMobileViewport();
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusListArrival(surfaceRef);

  return (
    <ListPage
      body="bounded"
      // Faces lead and the scope chip follows: the faces are the shortcut you arrive for. On a phone the faces
      // slot is the shared Filters disclosure, in the same position and order. The chip stays outside it,
      // because it is the character axis's way out.
      filters={isMobile ? null : <ChatListMonthFilter />}
      lead={
        <>
          {isMobile ? <ChatListPhoneFilters characterFilter={characterFilter} /> : <ChatListFacesStrip characterFilter={characterFilter} />}
          {characterFilter !== null ? <ChatListFilterChip filter={characterFilter} /> : null}
        </>
      }
      ref={surfaceRef}
      search={
        // One reset contract for both filters: the clear glyph sits inside the field's inline end, over a
        // constant reserve, so the value never reflows when it appears.
        <Row align="center" className="relative min-inline-0" grow={true}>
          <Input
            aria-label={SEARCH_LABEL}
            className="min-inline-0"
            grow={true}
            clearsGlyph={true}
            onValueChange={setChatListSearch}
            placeholder="Search chats…"
            value={query}
          />
          {query === "" ? null : <ClearFilterGlyph label={CLEAR_SEARCH_LABEL} onClick={clearSearch} />}
        </Row>
      }
      skipTo={SKIP_TO_LIST_LABEL}
    >
      <ChatListBody
        activeChatId={activeChatId}
        beforeRecencyAt={beforeRecencyAt}
        characterFilter={characterFilter}
        monthLabel={monthLabel}
        onClearMonth={clearMonth}
        onClearSearch={clearSearch}
        onDeletedChat={onDeletedChat}
        onNewChat={onNewChat}
        onSelect={onSelect}
        query={settledQuery}
      />
    </ListPage>
  );
}

interface ChatListBodyProps {
  readonly activeChatId: ChatId | null;
  readonly beforeRecencyAt: number | null;
  readonly characterFilter: ChatListCharacterFilter | null;
  readonly monthLabel: string | null;
  readonly onSelect: (chatId: ChatId) => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
  readonly onNewChat: () => void;
  readonly onClearMonth: () => void;
  readonly onClearSearch: () => void;
  readonly query: string;
}

/** A chat opened from a character's New chat or a Home tile stays out of the library until its first message
 *  (the husk lens, `@orb/db` chat-visibility), so an empty list beside an open room has to say that room is on
 *  its way. A temporary room never joins the list and an archived one is hidden by the archive lens, so
 *  neither earns the sentence. */
function useOpenChatJoinsList(activeChatId: ChatId | null): boolean {
  const trpc = useTRPC();
  const { data: openChat } = useGatedQuery(activeChatId, (chatId) => trpc.chat.getChat.queryOptions({ chatId }));
  return openChat !== undefined && !openChat.temporary && !openChat.archived;
}

/** The empty library's one sentence: a character scope names her, an unlisted open room says it is coming. */
function emptyListDescription(characterName: string | null, openChatJoinsList: boolean): string {
  if (characterName !== null) {
    return `No chats with ${characterName} yet. Start one, or clear the filter.`;
  }
  return openChatJoinsList ? "This chat joins your list after your first message." : "Pick a character to start your first conversation.";
}

/** The paged body. Non-suspending by construction (`createCollectionSurface` is a plain `useInfiniteQuery`),
 *  so the pending / error / empty ladder is rendered here rather than by a `QueryBoundary` above — the
 *  character-library precedent, and the reason the faces strip and the search field stay put across every
 *  body state instead of being torn down by a suspense fallback. */
function ChatListBody({
  activeChatId,
  beforeRecencyAt,
  characterFilter,
  monthLabel,
  onSelect,
  onDeletedChat,
  onNewChat,
  onClearMonth,
  onClearSearch,
  query,
}: ChatListBodyProps): ReactElement {
  const trpc = useTRPC();
  const scope = { beforeRecencyAt, characterId: characterFilter?.id ?? null, search: query };
  const collection = useChatListCollection({ trpc }, scope);
  const openChatJoinsList = useOpenChatJoinsList(activeChatId);
  // ONE derivation of "which axes are narrowing right now", shared by both zero-result arms — a per-arm list
  // is how the search arm came to know about the month in its COPY and not in its ACTIONS (#541).
  const exits = activeFilterExits({
    beforeRecencyAt,
    characterName: characterFilter?.name ?? null,
    onClearCharacter: clearChatListCharacterFilter,
    onClearMonth,
    onClearSearch,
    query,
  });

  if (collection.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (collection.error !== null) {
    return <QueryErrorState label="your chats" onRetry={collection.refetch} />;
  }
  if (collection.isEmpty && query === "" && beforeRecencyAt !== null) {
    return (
      <EmptyState
        action={<FilterExits exits={exits} />}
        description={monthEmptyDescription(characterFilter?.name ?? null, monthLabel)}
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title="No chats by then"
      />
    );
  }
  // `isEmpty` alone would swallow the SEARCH-empty case: a server predicate that matches nothing is a real
  // empty page, not proof that the underlying library itself is empty.
  if (collection.isEmpty && query === "") {
    return (
      <EmptyState
        // THE SECOND RULED `new chat` DOOR (#1361 item 2) — see this file's header for why it stands beside
        // the LIST band's `New` when the general law is one door per plane, and why no allowance table row
        // is minted for it.
        action={
          <Button onClick={onNewChat} size="sm">
            <Icon icon={Plus} size="sm" />
            New chat
          </Button>
        }
        description={emptyListDescription(characterFilter?.name ?? null, openChatJoinsList)}
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title={characterFilter === null ? CHAT_LIST_EMPTY_TITLE : NO_MATCHES_TITLE}
      />
    );
  }

  return (
    <Stack minHeight="shrinks" height="fill" gap="block">
      {/* The strip renders ABOVE this body (in the surface), so it stays put across every body state —
          including an empty scope, where it is the way OUT. */}
      <Stack minHeight="shrinks" grow={true}>
        <ChatRows
          activeChatId={activeChatId}
          characterName={characterFilter?.name ?? null}
          exits={exits}
          items={collection.items}
          listKey={chatListScopeKey(scope)}
          listReady={!collection.isPlaceholderData}
          listProps={collection.listProps}
          monthLabel={monthLabel}
          onDeletedChat={onDeletedChat}
          onSelect={onSelect}
          query={query}
        />
      </Stack>
    </Stack>
  );
}

interface ChatRowsProps {
  readonly activeChatId: ChatId | null;
  /** The scoped character's name, or `null` — the search-empty sentence has to name every axis that produced
   *  the emptiness, not only the one the arm is called after (#541). */
  readonly characterName: string | null;
  /** Every ACTIVE narrowing axis's way out ({@link activeFilterExits}). */
  readonly exits: readonly FilterExit[];
  readonly items: readonly ChatListItem[];
  readonly listProps: ReturnType<typeof useChatListCollection>["listProps"];
  /** The composed scope identity of every narrowing axis ({@link chatListScopeKey}) — an axis missing from
   *  it lands a deep-scrolled reader mid-scope. */
  readonly listKey: string;
  readonly listReady: boolean;
  readonly monthLabel: string | null;
  readonly onSelect: (chatId: ChatId) => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
  readonly query: string;
}

/** The search-empty → rows ladder. */
function ChatRows({
  activeChatId,
  characterName,
  exits,
  items,
  listKey,
  listProps,
  listReady,
  monthLabel,
  onDeletedChat,
  onSelect,
  query,
}: ChatRowsProps): ReactElement {
  const actions = useChatListRowActions();
  if (items.length === 0) {
    // The server searched the whole active scope, not only the pages that happened to be loaded.
    return (
      <EmptyState
        action={<FilterExits exits={exits} />}
        description={searchEmptyDescription(characterName, monthLabel, query)}
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title={NO_MATCHES_TITLE}
      />
    );
  }
  // The action-name disambiguators, resolved across the WHOLE rendered list (side-eye P2c): rows that share
  // a title AND a shown stamp escalate to a longer one, so no two rows announce the same action name.
  const qualifiers = chatRowQualifiers(items);
  const titleQualifiers = chatTitleQualifiers(items);
  const renderRow = (chat: ChatListItem, index: number): ReactNode => (
    <ChatListRow
      actions={actions}
      chat={chat}
      onDeletedChat={onDeletedChat}
      onSelect={onSelect}
      portraits={chat.participantPortraits}
      qualifier={qualifiers[index]}
      selected={chat.id === activeChatId}
      titleQualifier={titleQualifiers[index]}
    />
  );
  return (
    // The virtualizer's scroll element needs a BOUNDED height (`assertBoundedScrollHeight` throws at mount
    // otherwise) — `h-full` inside the surface's `min-h-0 flex-1` column is where that bound comes from.
    <Stack minHeight="shrinks" height="fill">
      <VirtualList
        // THE LIST NAMES ITSELF AS A LIST (side-eye HOME 2026-09-02 H20). It was `aria-label="Chats"` —
        // the same string the RAIL's own nav button carries one region over — so one document held two
        // different things under one accessible name and `snap --map` had to disambiguate them by index
        // (`[aria-label="Chats"]:visible >> nth=0` the button, `nth=1` the list). That is the same
        // collision the home jump tile was fixed for (`section-jump-rail.tsx`, rail sweep P3-19), and the
        // shell's own pattern for a list region is the noun plus the word (`Presets list`, and the
        // `"<section> list"` the pane landmark used before #493 made it read its visible band). The RAIL
        // keeps "Chats" — it names the SECTION, which is what a nav button names.
        aria-label={CHAT_LIST_NAME}
        height="fill"
        endApproachRows={listProps.endApproachRows}
        estimateSize={(): number => ESTIMATED_ROW_PX.compact}
        gapToken="tight"
        getItemKey={(item): string => item.id}
        items={items}
        onEndApproach={listProps.onEndApproach}
        renderItem={renderRow}
        resetScrollKey={listKey}
        resetScrollReady={listReady}
      />
    </Stack>
  );
}
