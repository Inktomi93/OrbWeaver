// The chats-list surface: a search field and the caller's chats as list-row rows
// (avatar/title/participants/relative time), select-to-open, with a per-row kebab menu. The title +
// count + New action live in the LIST chrome band now (`chat-list-header.tsx`, north-star §4 N2), not
// here.
//
// PAGED + VIRTUALIZED (2026-08-09). `chat.listChats` is a keyset page, read through the shared
// `useChatListCollection`, and the rows render into the sealed `<VirtualList>` — an 872-chat library used to
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
// Portraits (F7/D3) resolve HERE, not in the row: one non-blocking `character.list` read builds a
// characterId→seat map the rows index with their `participantCharacterIds` (one seat = a portrait, two or
// more = an AvatarStack). Reads its OWN selection (`useActiveChatId`) so the chats-section definition
// composing it stays a pure data object (the character/preset/world-info library-surface precedent); writes
// the choice out via onSelect/onNewChat/onDeletedChat.
//
// THE THREE NARROWING AXES ARE STORE STATE, NOT LOCAL STATE (#490 — `state/chat-list-filter-store.ts`). The
// per-character filter always was; search and month joined it, because the LIST CHROME BAND that prints the
// census (`components/chat-list-header.tsx`) feeds a different shell slot and could not see a `useState`
// here — which is how `CHATS 896` came to sit above twelve filtered rows. The faces strip + "Filtered: X ✕"
// chip live in `components/chat-list-character-filter.tsx` (the 450-line cap; this file composes them).

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Field } from "@orb/ui/field";
import { Icon, MessagesSquare, Plus, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack, Surface } from "@orb/ui/layout";
import { VirtualList } from "@orb/ui/virtual-list";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { useDebouncedValue, useFocusOnMount } from "#lib";
import type { ChatListCharacterFilter } from "#state";
import { setChatListMonth, setChatListSearch, useActiveChatId, useChatListCharacterFilter, useChatListMonth, useChatListSearch } from "#state";
import { ChatListFacesStrip, ChatListFilterChip } from "../components/chat-list-character-filter.tsx";
import { ChatListRow } from "../components/chat-list-row.tsx";
import { useChatListCollection } from "../hooks/use-chat-list-collection.ts";
import { useChatListRowActions } from "../hooks/use-chat-row-mutations.ts";
import { CHAT_LIST_SEARCH_DEBOUNCE_MS, chatListScopeKey, formatMonthLabel, monthExclusiveUpperBound } from "../lib/chat-list-scope.ts";
import { chatRowQualifiers } from "../lib/chat-summary-row.ts";

/** The list row, derived off the wire (the `chat-list-row.tsx` / `chat-summary-row.ts` spelling) — the
 *  collection hook deliberately exports no second name for it. */
type ChatListItem = inferOutput<Trpc["chat"]["listChats"]>["items"][number];

const SKELETON_ROW_COUNT = 5;

/** Row-height guess for the virtualizer; every row re-measures itself after mount. */
const ESTIMATED_ROW_PX = 44;

// THE MONTH CONTROL SAYS WHAT IT DOES (#490). It read "Jump to month", and the verb was a promise the
// mechanism does not keep: `beforeRecencyAt` is an EXCLUSIVE UPPER BOUND, so picking a month RE-ROOTS the
// list at that month and pages OLDER from there — measured, nothing newer than the anchor is reachable by
// scrolling, and the ✕ is the only way back. "Jump" means move-within (a scroll target you can leave by
// scrolling); "Show chats from" is what a bound actually is, and it makes the one-way behaviour the copy's
// own statement rather than a surprise. The BOUND is not the defect and does not move: it is what makes the
// keyset page cheap, and re-rooting a 896-row virtualized list is the only honest way to reach 2024.
//
// THE MONTH CONTROL IS DELIBERATELY THE NATIVE PICKER (#500 item 2, side-eye 2026-08-22 rail-chats P3 —
// "polish, or accept-and-record in the component header"; this is the RECORD). `input[type=month]` renders
// its interior as UA chrome (`--------- ----` plus the browser's calendar glyph on an empty value), which
// reads unlike its two house-styled siblings in this column. Accepted, because every alternative is worse
// for the one job this control does: the native control already types (`2024-06` straight from the
// keyboard), already localizes its own display, already opens the OS wheel picker on a phone, is already
// correctly labelled (`aria-labelledby` → the visible label below) and already passes contrast at 13.29:1.
// A house-built month picker would be a NEW @orb/ui primitive carrying its own popup, roving keyboard model
// and locale table, minted for a single secondary filter — and it would be the only date affordance in the
// app that is not the platform's. The `Input` primitive's box (border, radius, focus ring, instrument-tier
// font step) is applied, so the control's OUTSIDE is house voice; only its interior is the UA's.
const MONTH_LABEL = "Show chats from";
const SKIP_TO_LIST_LABEL = "Skip to chats";
const CLEAR_MONTH_LABEL = "Clear the month";
const SEARCH_LABEL = "Search chats";
const CLEAR_SEARCH_LABEL = "Clear the search";

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
  const settledQuery = useDebouncedValue(query.trim(), CHAT_LIST_SEARCH_DEBOUNCE_MS);
  const clearSearch = (): void => setChatListSearch("");
  const clearMonth = (): void => setChatListMonth("");
  const characterFilter = useChatListCharacterFilter();
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    // INSTRUMENT tier (density-pass-spec.md §3.1 LIST panes): the pane is scanned, not operated, so its
    // islands resolve the dense steps. `<Surface>` is display:contents — it declares the tier for the
    // subtree without adding a box to the height chain.
    <Surface tier="instrument">
      <Stack className="h-full min-h-0 outline-none" gap="row" ref={surfaceRef} tabIndex={-1}>
        {/* SKIP THE PANE CHROME (#500 item 4, side-eye 2026-08-22 rail-chats P3). The app-shell's own
            "Skip to content" lands in `<main>` — it skips PAST this pane, and on the Chats surface the work
            starts in the LIST. Measured Tab order from the top of the boot: 13 stops (the rail's eight
            sections, the theme + settings + persona controls, Import) before the list's first control, and
            the ONLY skip target was CONTENT. This lands directly on the first chat row.
            The exact posture + spelling of the landed characters twin (#491,
            `character/surfaces/character-library-surface.tsx`): `not-focus-visible:sr-only`, never
            `sr-only focus-visible:not-sr-only` — `not-sr-only` is a RESET whose `padding:0; height:auto`
            lands in the Button's own layer and wins, rendering the revealed control under the WCAG 2.5.8
            floor. FIRST IN DOM ORDER inside the surface is the whole contract: a skip control that is not
            the first focusable is a second tab stop, not a skip.
            Spelled INLINE rather than extracted beside it: the client-shared composite bar is recorded as
            "3+ sites AND changing together" (`#components/list-pane-header.tsx`), and this is site two. */}
        <Button
          className="not-focus-visible:sr-only focus-visible:self-start"
          intent="secondary"
          onClick={(): void => surfaceRef.current?.querySelector<HTMLElement>('[data-slot="list-row-body"]')?.focus()}
          size="sm"
          type="button"
        >
          {SKIP_TO_LIST_LABEL}
        </Button>
        {/* Mock order (side-eye P2b): FACES first, then the scope chip, then search — the faces are the
          shortcut you arrive for, and burying them under the search box made them read as a filter widget. */}
        <ChatListFacesStrip characterFilter={characterFilter} />
        {characterFilter !== null ? <ChatListFilterChip filter={characterFilter} /> : null}
        {/* ONE SEARCH VOICE (#99 item 2). Every other search box on the app says what it searches —
            "Search characters…", "Search presets", "Search your documents", "Search characters, scenes,
            memories…" — and this one said "Search the weave…", a brand phrase that names no noun and does
            not match its own accessible name. A WCAG 2.5.3 voice-control user could not say what they saw,
            and a reader could not tell whether it searched chats, characters or the whole library. The
            weave is the product's word for itself, which is a fine thing for a hero line and the wrong
            thing on a filter field. */}
        {/* ONE RESET CONTRACT FOR BOTH FILTERS (#490). The month control grew a ✕ the moment it held a
            value and the search field beside it never did — two sibling filters, two different ways out,
            in one 290px column, and the only "Clear search" in the app lived inside the ZERO-RESULTS empty
            state. So leaving a 12-of-896 result meant select-all-delete. Same affordance, same gate
            (non-empty), same glyph, same voice — spelled as the identical Row/Button pair below rather
            than a shared local component, because the two differ in their field chrome (the month owes a
            visible `Field` label; a search box's placeholder IS its label) and a wrapper hiding that
            difference would be the abstraction, not the fix. */}
        <Row align="center" gap="field">
          <Input aria-label={SEARCH_LABEL} className="min-w-0 flex-1" onValueChange={setChatListSearch} placeholder="Search chats…" value={query} />
          {query === "" ? null : (
            <Button aria-label={CLEAR_SEARCH_LABEL} intent="ghost" onClick={clearSearch} size="icon" title={CLEAR_SEARCH_LABEL} type="button">
              <Icon icon={X} size="sm" />
            </Button>
          )}
        </Row>
        <Field label={MONTH_LABEL}>
          <Row align="center" gap="field">
            <Input className="min-w-0 flex-1" onValueChange={setChatListMonth} type="month" value={month} />
            {month === "" ? null : (
              <Button aria-label={CLEAR_MONTH_LABEL} intent="ghost" onClick={clearMonth} size="icon" title={CLEAR_MONTH_LABEL} type="button">
                <Icon icon={X} size="sm" />
              </Button>
            )}
          </Row>
        </Field>
        <Stack className="min-h-0 flex-1">
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
        </Stack>
      </Stack>
    </Surface>
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

  if (collection.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (collection.error !== null) {
    return <QueryErrorState label="your chats" onRetry={collection.refetch} />;
  }
  if (collection.isEmpty && query === "" && beforeRecencyAt !== null) {
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={onClearMonth} size="sm">
            Clear month
          </Button>
        }
        description={
          characterFilter === null
            ? `No chats found by ${monthLabel ?? "the selected month"}.`
            : `No chats with ${characterFilter.name} found by ${monthLabel ?? "the selected month"}.`
        }
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
        action={
          <Button intent="primary" onClick={onNewChat} size="sm">
            <Icon icon={Plus} size="sm" />
            New chat
          </Button>
        }
        description={
          characterFilter === null
            ? "Pick a character to start your first conversation."
            : `No chats with ${characterFilter.name} yet. Start one, or clear the filter.`
        }
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title={characterFilter === null ? "No chats yet" : "No matches"}
      />
    );
  }

  return (
    <Stack className="h-full min-h-0" gap="block">
      {/* The strip renders ABOVE this body (in the surface), so it stays put across every body state —
          including an empty scope, where it is the way OUT. */}
      <Stack className="min-h-0 flex-1">
        <ChatRows
          activeChatId={activeChatId}
          items={collection.items}
          listKey={chatListScopeKey(scope)}
          listReady={!collection.isPlaceholderData}
          listProps={collection.listProps}
          monthLabel={monthLabel}
          onClearSearch={onClearSearch}
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
  readonly items: readonly ChatListItem[];
  readonly listProps: ReturnType<typeof useChatListCollection>["listProps"];
  /** The composed scope identity of every narrowing axis ({@link chatListScopeKey}) — an axis missing from
   *  it lands a deep-scrolled reader mid-scope. */
  readonly listKey: string;
  readonly listReady: boolean;
  readonly monthLabel: string | null;
  readonly onSelect: (chatId: ChatId) => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
  readonly onClearSearch: () => void;
  readonly query: string;
}

/** The search-empty → rows ladder. */
function ChatRows({
  activeChatId,
  items,
  listKey,
  listProps,
  listReady,
  monthLabel,
  onClearSearch,
  onDeletedChat,
  onSelect,
  query,
}: ChatRowsProps): ReactElement {
  const actions = useChatListRowActions();
  if (items.length === 0) {
    // The server searched the whole active scope, not only the pages that happened to be loaded.
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={onClearSearch} size="sm">
            Clear search
          </Button>
        }
        description={monthLabel === null ? `No chat matches "${query}".` : `No chat by ${monthLabel} matches "${query}".`}
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title="No matches"
      />
    );
  }
  // The action-name disambiguators, resolved across the WHOLE rendered list (side-eye P2c): rows that share
  // a title AND a shown stamp escalate to a longer one, so no two rows announce the same action name.
  const qualifiers = chatRowQualifiers(items);
  const renderRow = (chat: ChatListItem, index: number): ReactNode => (
    <ChatListRow
      actions={actions}
      chat={chat}
      onDeletedChat={onDeletedChat}
      onSelect={onSelect}
      portraits={chat.participantPortraits}
      qualifier={qualifiers[index]}
      selected={chat.id === activeChatId}
    />
  );
  return (
    // The virtualizer's scroll element needs a BOUNDED height (`assertBoundedScrollHeight` throws at mount
    // otherwise) — `h-full` inside the surface's `min-h-0 flex-1` column is where that bound comes from.
    <Stack className="h-full min-h-0">
      <VirtualList
        aria-label="Chats"
        className="h-full"
        endApproachRows={listProps.endApproachRows}
        estimateSize={(): number => ESTIMATED_ROW_PX}
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
