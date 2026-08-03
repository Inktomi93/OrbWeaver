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
import { Row, Stack, Surface } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import { CharacterPicker, FaceStrip } from "#components";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { chatsWithCharacter, useFocusOnMount } from "#lib";
import type { ChatListCharacterFilter } from "#state";
import { clearChatListCharacterFilter, setChatListCharacterFilter, useActiveChatId, useChatListCharacterFilter } from "#state";
import { ChatListRow } from "../components/chat-list-row";
import { useChatPortraitMap } from "../hooks/use-chat-portrait-map";
import type { ChatRowPortrait } from "../lib/chat-summary-row";
import { chatPortraits, chatRowQualifiers } from "../lib/chat-summary-row";
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
    // INSTRUMENT tier (density-pass-spec.md §3.1 LIST panes): the pane is scanned, not operated, so its
    // islands resolve the dense steps. `<Surface>` is display:contents — it declares the tier for the
    // subtree without adding a box to the height chain.
    <Surface tier="instrument">
      <Stack className="h-full min-h-0 outline-none" gap="row" ref={surfaceRef} tabIndex={-1}>
        {/* Mock order (side-eye P2b): FACES first, then the scope chip, then search — the faces are the
          shortcut you arrive for, and burying them under the search box made them read as a filter widget.
          The strip lives HERE rather than in the suspending body so it can sit above the chip; it reads the
          SAME `chat.listChats` cache entry non-suspensefully (no new key, no second truth) and renders
          nothing until it lands, which is its own empty posture anyway. */}
        <FacesStrip characterFilter={characterFilter} />
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
    </Surface>
  );
}

/** Arm B — the faces strip: the pane learns FACES without the rail learning a new section. Tapping a face
 *  sets the LANDED per-character filter chip, so the same pane instantly becomes her threads, visibly
 *  "filtered by" (a chip you can clear) rather than a second list that owns her chats.
 *
 *  A plain `useQuery` on the chats key the body suspends on: a shortcut row must not gate the pane's chrome
 *  on a fetch, and an unresolved read renders NOTHING (the strip's own data-driven empty posture).
 *
 *  The curation hands over EVERY character you have chatted with, in recency order — the strip's own fold
 *  (FACEFILT) decides how many of them the pane can hold, so a cap here would only be a second, blinder
 *  answer to the same question. What the curation cannot know is the character you scoped the pane to from
 *  the picker: she may have no chats at all yet (that is the "No chats with X yet" arm), so she is prepended
 *  as a face — the strip must never be filtering by someone who is not in it. */
function FacesStrip({ characterFilter }: { readonly characterFilter: ChatListCharacterFilter | null }): ReactElement | null {
  const trpc = useTRPC();
  const { data: chats } = useQuery(trpc.chat.listChats.queryOptions({}));
  const characterById = useChatPortraitMap();
  const recent = recentFaces(chats ?? [], characterById);
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

function ChatListBody({ activeChatId, characterFilter, onSelect, onDeletedChat, onNewChat, onClearSearch, query }: ChatListBodyProps): ReactElement {
  const trpc = useTRPC();
  const { data: chats } = useSuspenseQuery(trpc.chat.listChats.queryOptions({}));
  const characterById = useChatPortraitMap();

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
      {/* The strip renders ABOVE this boundary (the surface), so it stays put across every body state —
          including an empty scope, where it is the way OUT. */}
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
  // The action-name disambiguators, resolved across the WHOLE rendered list (side-eye P2c): rows that share
  // a title AND a shown stamp escalate to a longer one, so no two rows announce the same action name.
  const qualifiers = chatRowQualifiers(filtered);
  return (
    <Stack aria-label="Chats" className="h-full min-h-0 overflow-y-auto overscroll-contain" gap="tight" role="list">
      {filtered.map((chat, index) => (
        <ChatListRow
          chat={chat}
          key={chat.id}
          onDeletedChat={onDeletedChat}
          onSelect={onSelect}
          portraits={chatPortraits(chat.participantCharacterIds, characterById)}
          qualifier={qualifiers[index]}
          selected={chat.id === activeChatId}
        />
      ))}
    </Stack>
  );
}
