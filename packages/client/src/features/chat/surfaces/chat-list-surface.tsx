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
//     a character seat's name OR the newest message's body — over the ENTIRE library. The value is
//     DEBOUNCED, not just deferred: deferring picks a render, and every distinct string here is a round trip.
//
// Portraits (F7/D3) resolve HERE, not in the row: one non-blocking `character.list` read builds a
// characterId→seat map the rows index with their `participantCharacterIds` (one seat = a portrait, two or
// more = an AvatarStack). Reads its OWN selection (`useActiveChatId`) so the chats-section definition
// composing it stays a pure data object (the character/preset/world-info library-surface precedent); writes
// the choice out via onSelect/onNewChat/onDeletedChat.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, MessagesSquare, Plus, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack, Surface } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
import { CharacterPicker, FaceStrip } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { useDebouncedValue, useFocusOnMount } from "#lib";
import type { ChatListCharacterFilter } from "#state";
import { clearChatListCharacterFilter, setChatListCharacterFilter, useActiveChatId, useChatListCharacterFilter } from "#state";
import { ChatListRow } from "../components/chat-list-row.tsx";
import { useChatListCollection } from "../hooks/use-chat-list-collection.ts";
import { useChatPortraitMap, useChatPortraitMapPending } from "../hooks/use-chat-portrait-map.ts";
import type { ChatRowPortrait } from "../lib/chat-summary-row.ts";
import { chatPortraits, chatRowQualifiers } from "../lib/chat-summary-row.ts";
import { recentFaces } from "../lib/recent-faces.ts";

/** The list row, derived off the wire (the `chat-list-row.tsx` / `chat-summary-row.ts` spelling) — the
 *  collection hook deliberately exports no second name for it. */
type ChatListItem = inferOutput<Trpc["chat"]["listChats"]>["items"][number];

const SKELETON_ROW_COUNT = 5;

/** Row-height guess for the virtualizer; every row re-measures itself after mount. */
const ESTIMATED_ROW_PX = 44;

/** Keystroke→request damper for the server-side search. Long enough that typing a name is one query rather
 *  than eight, short enough that the list answers while the user is still looking at the box. */
const SEARCH_DEBOUNCE_MS = 250;

/** How many recent chats the FACES curation reads. The strip answers "who was I just with", so a bounded
 *  recents page IS its question — and it must stay UNFILTERED (it is the thing you pick the filter from), so
 *  it cannot ride the scoped collection below. Matches the server's own page ceiling. */
const FACES_SOURCE_LIMIT = 100;

export interface ChatListSurfaceProps {
  readonly onSelect: (chatId: ChatId) => void;
  readonly onNewChat: () => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
}

export function ChatListSurface({ onSelect, onNewChat, onDeletedChat }: ChatListSurfaceProps): ReactElement {
  const activeChatId = useActiveChatId();
  const [query, setQuery] = useState("");
  const settledQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const clearSearch = (): void => setQuery("");
  const characterFilter = useChatListCharacterFilter();
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    // INSTRUMENT tier (density-pass-spec.md §3.1 LIST panes): the pane is scanned, not operated, so its
    // islands resolve the dense steps. `<Surface>` is display:contents — it declares the tier for the
    // subtree without adding a box to the height chain.
    <Surface tier="instrument">
      <Stack className="h-full min-h-0 outline-none" gap="row" ref={surfaceRef} tabIndex={-1}>
        {/* Mock order (side-eye P2b): FACES first, then the scope chip, then search — the faces are the
          shortcut you arrive for, and burying them under the search box made them read as a filter widget. */}
        <FacesStrip characterFilter={characterFilter} />
        {characterFilter !== null ? <FilterChip filter={characterFilter} /> : null}
        <Input aria-label="Search chats" onValueChange={setQuery} placeholder="Search the weave…" value={query} />
        <Stack className="min-h-0 flex-1">
          <ChatListBody
            activeChatId={activeChatId}
            characterFilter={characterFilter}
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

/** Arm B — the faces strip: the pane learns FACES without the rail learning a new section. Tapping a face
 *  sets the LANDED per-character filter chip, so the same pane instantly becomes her threads, visibly
 *  "filtered by" (a chip you can clear) rather than a second list that owns her chats.
 *
 *  A plain bounded `useQuery`, NOT the scoped collection below: a shortcut row must not gate the pane's
 *  chrome on a fetch, and the strip is what you pick the filter FROM — reading the character-scoped page
 *  would collapse it to the one face already selected. An unresolved read RESERVES the strip's box
 *  (`pending` — measured: rendering nothing shoved the search field and the whole row list 74px on
 *  arrival); a resolved-but-faceless one still renders nothing, which is the strip's own data-driven
 *  empty posture.
 *
 *  The curation hands over the characters you have chatted with MOST RECENTLY, in recency order — the
 *  strip's own fold (FACEFILT) decides how many of them the pane can hold, so a cap here would only be a
 *  second, blinder answer to the same question. What the curation cannot know is the character you scoped
 *  the pane to from the picker: she may have no chats at all yet (that is the "No chats with X yet" arm), so
 *  she is prepended as a face — the strip must never be filtering by someone who is not in it. */
function FacesStrip({ characterFilter }: { readonly characterFilter: ChatListCharacterFilter | null }): ReactElement | null {
  const trpc = useTRPC();
  const { data: page, isPending: chatsPending } = useQuery(trpc.chat.listChats.queryOptions({ limit: FACES_SOURCE_LIMIT }));
  const characterById = useChatPortraitMap();
  // BOTH reads decide a face: a chat names a character id, the portrait map turns it into a face. Gating
  // the reservation on the chats read alone still shifted, because entering the section refetches
  // `character.list` at the portrait map's own limit and the strip popped in when THAT landed (measured).
  const portraitsPending = useChatPortraitMapPending();
  const recent = recentFaces(page?.items ?? [], characterById);
  const scopedFace =
    characterFilter !== null && !recent.some((face) => face.id === characterFilter.id)
      ? [{ avatarHash: characterById.get(characterFilter.id)?.hash ?? null, id: characterFilter.id, name: characterFilter.name }]
      : [];
  const faces = [...scopedFace, ...recent];
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
  // Captions on: this strip is a NAMED shortcut list (the library's favorites strip stays portraits-only),
  // so a face you haven't opened in a week is still identifiable without hovering it. The kicker is the
  // mock's group label (side-eye P2b) — without it the row of portraits reads as decoration, and a cold user
  // never learns that tapping one scopes the list below.
  //
  // It names the VERB, not the contents (home side-eye): a clickable character face LAUNCHES a chat
  // everywhere else in the app — on home, one rail click away — so a bare "Faces" left the same picture
  // carrying opposite verbs. "Filter by character" is the line that disambiguates before the click (owner: name the thing, not the cuteness), and the
  // selected face's accent caption + the "Filtered: X" chip below confirm it after.
  //
  // The strip FOLDS to the pane (FACEFILT — the owner's nine scrolling faces on a six-character library):
  // the faces that fit stay a one-tap shortcut, and the rest of the cast lives behind the tile, which opens
  // the house character picker over the WHOLE library — so it also reaches someone you have never opened a
  // chat with, which no amount of scrolling ever could.
  return (
    <FaceStrip
      caption={true}
      items={faces}
      kicker="Filter by character"
      label="Recent characters"
      onSelect={scopeToFace}
      // RESERVE THE BOX WHILE THE READ IS IN FLIGHT (measured 2026-08-09: the pane shifted 74px on data
      // arrival — the strip mounted above the search field and pushed the field + the whole row list down,
      // §4.3 rule 7). `isPending` is "no answer yet", never "no faces": a settled empty answer still renders
      // nothing, which is this strip's own ruling.
      pending={chatsPending || portraitsPending}
      overflow={{
        label: "Filter by another character",
        // EXCLUDE THE FACES ALREADY ON THE ROW (side-eye 2026-08-03 P3): the tile says `+N More` and then
        // listed all ten, including the four visible beside it — so the number on the tile and the number
        // behind it disagreed. The strip hands down what it is currently showing; the picker drops those.
        render: ({ close, shownIds }): ReactElement => (
          <CharacterPicker
            autoFocusSearch={true}
            emptyText="No other characters to filter by."
            excludeIds={shownIds.map((id) => castId<CharacterId>(id))}
            label="Filter by another character"
            onSelect={(id, name): void => {
              setChatListCharacterFilter({ id, name });
              close();
            }}
            placeholder="Search characters…"
          />
        ),
      }}
      // Tapping a face SETS a filter and re-tapping CLEARS it (`scopeToFace` above) — a toggle, so the tile
      // owes `aria-pressed`, not `aria-current`.
      selectMode="toggle"
      selectedId={characterFilter?.id ?? null}
      verb="Show chats with"
    />
  );
}

function FilterChip({ filter }: { readonly filter: ChatListCharacterFilter }): ReactElement {
  return (
    <Row align="center" gap="field">
      <Text voice="kicker">Filtered:</Text>
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

/** The paged body. Non-suspending by construction (`createCollectionSurface` is a plain `useInfiniteQuery`),
 *  so the pending / error / empty ladder is rendered here rather than by a `QueryBoundary` above — the
 *  character-library precedent, and the reason the faces strip and the search field stay put across every
 *  body state instead of being torn down by a suspense fallback. */
function ChatListBody({ activeChatId, characterFilter, onSelect, onDeletedChat, onNewChat, onClearSearch, query }: ChatListBodyProps): ReactElement {
  const trpc = useTRPC();
  const collection = useChatListCollection({ trpc }, { characterId: characterFilter?.id ?? null, search: query });
  const characterById = useChatPortraitMap();

  if (collection.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (collection.error !== null) {
    return <QueryErrorState label="your chats" onRetry={collection.refetch} />;
  }
  // `isEmpty` alone would swallow the SEARCH-empty case: with the predicate on the server, a query that
  // matches nothing comes back as a genuinely empty page, and the library-empty copy ("No chats yet — pick a
  // character to start your first conversation") is then a flat lie over a library full of chats. Measured on
  // a live drive against the real seed data, which is the only place the two states are distinguishable.
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
          characterById={characterById}
          items={collection.items}
          listProps={collection.listProps}
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
  readonly characterById: ReadonlyMap<string, ChatRowPortrait>;
  readonly items: readonly ChatListItem[];
  readonly listProps: ReturnType<typeof useChatListCollection>["listProps"];
  readonly onSelect: (chatId: ChatId) => void;
  readonly onDeletedChat?: ((chatId: ChatId) => void) | undefined;
  readonly onClearSearch: () => void;
  readonly query: string;
}

/** The search-empty → rows ladder. */
function ChatRows({ activeChatId, characterById, items, listProps, onClearSearch, onDeletedChat, onSelect, query }: ChatRowsProps): ReactElement {
  if (items.length === 0) {
    // An HONEST claim now that the predicate is the server's: the whole library was searched, not the pages
    // that happened to be loaded — so "no chat matches" is a statement this surface has standing to make, and
    // the next step is clearing the search rather than fetching more.
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
  // The action-name disambiguators, resolved across the WHOLE rendered list (side-eye P2c): rows that share
  // a title AND a shown stamp escalate to a longer one, so no two rows announce the same action name.
  const qualifiers = chatRowQualifiers(items);
  const renderRow = (chat: ChatListItem, index: number): ReactNode => (
    <ChatListRow
      chat={chat}
      onDeletedChat={onDeletedChat}
      onSelect={onSelect}
      portraits={chatPortraits(chat.participantCharacterIds, characterById)}
      qualifier={qualifiers[index]}
      selected={chat.id === activeChatId}
    />
  );
  return (
    // The virtualizer's scroll element needs a BOUNDED height (`assertBoundedScrollHeight` throws at mount
    // otherwise) — `h-full` inside the surface's `min-h-0 flex-1` column is where that bound comes from.
    <Stack aria-label="Chats" className="h-full min-h-0" role="list">
      <VirtualList
        className="h-full"
        endApproachRows={listProps.endApproachRows}
        estimateSize={(): number => ESTIMATED_ROW_PX}
        gapToken="tight"
        getItemKey={(item): string => item.id}
        items={items}
        onEndApproach={listProps.onEndApproach}
        renderItem={renderRow}
      />
    </Stack>
  );
}
