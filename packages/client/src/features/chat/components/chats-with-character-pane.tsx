// ChatsWithCharacterPane — the CHAT-owned body of the character screen's LIST projection
// (list-pane-projection Arm A, §3.2). Chat owns chat-row anatomy and the `listChats` consumer, so the rows
// are rendered HERE and the CHARACTER section hosts them: the pane is exported on chat's front door and
// threaded into `makeCharactersSection` at the composition root (`main.tsx`). Neither feature imports the
// other — `client-features-no-cross` stays satisfied by construction.
//
// The D18 guardrail, structurally: this reads the SAME `chat.listChats` seam as the chats pane, through the
// SAME `useChatListCollection`, with `characterId` set. There is no character-scoped chat read, key, or
// store anywhere in this file — the projection is an argument to the one first-class chats read.
//
// PAGED + VIRTUALIZED (2026-08-09), and the projection moved SERVER-side with it: this used to pull the
// caller's entire membership list and `.filter()` it down to her threads, which on an 872-chat library meant
// ~880 queries and one rendered row per chat to show three. Now the server does the narrowing, the rows
// arrive a keyset page at a time, and `<VirtualList>` paints only the window. Search is a server param too
// (the chats pane's header carries the ruling).
//
// Row click = PLAY: the room never renders inside the characters section, so selecting a row writes the
// active chat and switches sections (§8). That is chat's own business, which is why the injected view
// carries only the subject and the host-owned New-chat primary.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Stack, Surface } from "@orb/ui/layout";
import { VirtualList } from "@orb/ui/virtual-list";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import type { CharacterChatsProjectionView } from "#lib";
import { useDebouncedValue } from "#lib";
import { selectChatFromList, setActiveSection, useActiveChatId } from "#state";
import { useChatListCollection } from "../hooks/use-chat-list-collection.ts";
import { useChatPortraitMap } from "../hooks/use-chat-portrait-map.ts";
import { chatPortraits, chatRowQualifiers } from "../lib/chat-summary-row.ts";
import { ChatListRow } from "./chat-list-row.tsx";

/** The list row, derived off the wire (the `chat-list-row.tsx` / `chat-summary-row.ts` spelling) — the
 *  collection hook deliberately exports no second name for it. */
type ChatListItem = inferOutput<Trpc["chat"]["listChats"]>["items"][number];

const SKELETON_ROW_COUNT = 4;
/** Row-height guess for the virtualizer; every row re-measures itself after mount. */
const ESTIMATED_ROW_PX = 44;
/** The chats pane's damper — one home would be a shared constant with one other reader, which §13.0's bar
 *  does not clear; the VALUE agreeing is what matters and both headers say why. */
const SEARCH_DEBOUNCE_MS = 250;
/** Above this many loaded rows the pane grows a search field. Below it, a search box would be chrome over a
 *  list you can already read (§3.5) — but once a search is RUNNING the field stays regardless of how far it
 *  narrows the list, or the control would vanish under the user mid-query. */
const SEARCH_THRESHOLD = 8;

/** The chats-with-this-character projection, rendered as the characters section's LIST body. Its props ARE
 *  the published `CharacterChatsProjectionView` (the O5 door shape) — never a second spelling of it. */
export function ChatsWithCharacterPane({ characterId, characterName, onNewChat }: CharacterChatsProjectionView): ReactElement {
  const trpc = useTRPC();
  const activeChatId = useActiveChatId();
  const characterById = useChatPortraitMap();
  const [query, setQuery] = useState("");
  const settledQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const collection = useChatListCollection({ trpc }, { characterId, search: settledQuery });

  if (collection.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (collection.error !== null) {
    return <QueryErrorState label={`chats with ${characterName}`} onRetry={collection.refetch} />;
  }
  if (collection.isEmpty && settledQuery === "") {
    return (
      // Scale is the primitive's own business (side-eye P2f): `EmptyState` drops a type step by CONTAINER
      // QUERY inside a ~307px LIST pane, so this call site says WHAT to teach and nothing about how big.
      //
      // ONE PRIMARY PER REGION (side-eye NR2): the LIST band directly above this pane already carries the
      // "New chat" primary for this mode, so the empty state's own action demotes to secondary — the empty
      // state still ACTS (never a dead end), it just stops competing with the band for the same intent. The
      // identity row above drops its "no chats yet" gloss for the same reason: this pane already says it.
      <EmptyState
        action={
          <Button intent="secondary" onClick={onNewChat} size="sm">
            <Icon icon={Plus} size="sm" />
            New chat
          </Button>
        }
        description={`No chats with ${characterName} yet — start the first one.`}
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title="No chats yet"
      />
    );
  }

  const items = collection.items;
  // This pane is THE collision case (side-eye P2c): every row can be titled "Azarael", and the newest few
  // share a stamp — so the disambiguator is resolved across the list, not per row.
  const qualifiers = chatRowQualifiers(items);
  const renderRow = (chat: ChatListItem, index: number): ReactNode => (
    <ChatListRow
      chat={chat}
      onSelect={(chatId): void => {
        selectChatFromList(chatId);
        setActiveSection("chats");
      }}
      portraits={chatPortraits(chat.participantCharacterIds, characterById)}
      qualifier={qualifiers[index]}
      selected={chat.id === activeChatId}
    />
  );

  return (
    // INSTRUMENT tier (density-pass-spec.md §3.1): a LIST pane, scanned — same steps as the chats pane it
    // mirrors, so the two lists of the same rows can never drift apart in density.
    <Surface tier="instrument">
      <Stack className="h-full min-h-0" gap="row">
        {items.length > SEARCH_THRESHOLD || query !== "" ? (
          <Input aria-label={`Search chats with ${characterName}`} onValueChange={setQuery} placeholder={`Search chats with ${characterName}…`} value={query} />
        ) : null}
        {items.length === 0 ? (
          <EmptyState
            action={
              <Button intent="secondary" onClick={(): void => setQuery("")} size="sm">
                Clear search
              </Button>
            }
            description={`No chat with ${characterName} matches "${settledQuery}".`}
            icon={<Icon icon={MessagesSquare} size="lg" />}
            title="No matches"
          />
        ) : (
          // The virtualizer's scroll element needs a BOUNDED height (`assertBoundedScrollHeight` throws at
          // mount otherwise) — `h-full` inside this `min-h-0 flex-1` column is where that bound comes from.
          <Stack aria-label={`Chats with ${characterName}`} className="min-h-0 flex-1" role="list">
            {/* Server order, verbatim (D4): the star is a MARKER, not a sort key — a projection ordered
              differently from the chats pane would read as a second, disagreeing list. */}
            <VirtualList
              className="h-full"
              endApproachRows={collection.listProps.endApproachRows}
              estimateSize={(): number => ESTIMATED_ROW_PX}
              gapToken="tight"
              getItemKey={(item): string => item.id}
              items={items}
              onEndApproach={collection.listProps.onEndApproach}
              renderItem={renderRow}
            />
          </Stack>
        )}
      </Stack>
    </Surface>
  );
}
