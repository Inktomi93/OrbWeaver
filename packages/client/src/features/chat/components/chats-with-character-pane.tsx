// ChatsWithCharacterPane — the CHAT-owned body of the character screen's LIST projection
// (list-pane-projection Arm A, §3.2). Chat owns chat-row anatomy and the `listChats` consumer, so the rows
// are rendered HERE and the CHARACTER section hosts them: the pane is exported on chat's front door and
// threaded into `makeCharactersSection` at the composition root (`main.tsx`). Neither feature imports the
// other — `client-features-no-cross` stays satisfied by construction.
//
// The D18 guardrail, structurally: this reads the SAME `trpc.chat.listChats` cache entry as the chats pane
// (one truth, one order, free `chatsChanged` freshness) and filters it with the ONE `chatsWithCharacter`
// predicate. There is no character-scoped chat read, key, or store anywhere in this file.
//
// Row click = PLAY: the room never renders inside the characters section, so selecting a row writes the
// active chat and switches sections (§8). That is chat's own business, which is why the injected view
// carries only the subject and the host-owned New-chat primary.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useState } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import type { CharacterChatsProjectionView } from "#lib";
import { chatsWithCharacter } from "#lib";
import { selectChatFromList, setActiveSection, useActiveChatId } from "#state";
import { useChatPortraitMap } from "../hooks/use-chat-portrait-map";
import { chatPortraits } from "../lib/chat-summary-row";
import { filterChats } from "../lib/filter-chats";
import { ChatListRow } from "./chat-list-row";

const SKELETON_ROW_COUNT = 4;
/** Above this many rows the pane grows a search field — the same `useDeferredValue` + `filterChats` pattern
 *  the chats pane uses. Below it, a search box would be chrome over a list you can already read (§3.5). */
const SEARCH_THRESHOLD = 8;

/** The chats-with-this-character projection, rendered as the characters section's LIST body. Its props ARE
 *  the published `CharacterChatsProjectionView` (the O5 door shape) — never a second spelling of it. */
export function ChatsWithCharacterPane({ characterId, characterName, onNewChat }: CharacterChatsProjectionView): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label={`chats with ${characterName}`} onRetry={retry} />}
    >
      <ProjectionBody characterId={characterId} characterName={characterName} onNewChat={onNewChat} />
    </QueryBoundary>
  );
}

function ProjectionBody({ characterId, characterName, onNewChat }: CharacterChatsProjectionView): ReactElement {
  const trpc = useTRPC();
  // The SAME cache entry the chats pane reads — usually already warm here, because the character library
  // beside this pane reads it for its resume map.
  const { data: chats } = useSuspenseQuery(trpc.chat.listChats.queryOptions({}));
  const characterById = useChatPortraitMap();
  const activeChatId = useActiveChatId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query, "");

  const projected = chatsWithCharacter(chats, characterId);
  if (projected.length === 0) {
    return (
      // Scale is the primitive's own business (side-eye P2f): `EmptyState` drops a type step by CONTAINER
      // QUERY inside a ~307px LIST pane, so this call site says WHAT to teach and nothing about how big.
      <EmptyState
        action={
          <Button intent="primary" onClick={onNewChat} size="sm">
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

  const filtered = filterChats(projected, deferredQuery);
  return (
    <Stack className="h-full min-h-0" gap="block">
      {projected.length > SEARCH_THRESHOLD ? (
        <Input aria-label={`Search chats with ${characterName}`} onValueChange={setQuery} placeholder={`Search chats with ${characterName}…`} value={query} />
      ) : null}
      {filtered.length === 0 ? (
        <EmptyState
          action={
            <Button intent="secondary" onClick={(): void => setQuery("")} size="sm">
              Clear search
            </Button>
          }
          description={`No chat with ${characterName} matches "${deferredQuery}".`}
          icon={<Icon icon={MessagesSquare} size="lg" />}
          title="No matches"
        />
      ) : (
        <Stack aria-label={`Chats with ${characterName}`} className="h-full min-h-0 overflow-y-auto overscroll-contain" gap="row" role="list">
          {/* Server order, verbatim (D4): the star is a MARKER, not a sort key — a projection ordered
              differently from the chats pane would read as a second, disagreeing list. */}
          {filtered.map((chat) => (
            <ChatListRow
              chat={chat}
              key={chat.id}
              onSelect={(chatId): void => {
                selectChatFromList(chatId);
                setActiveSection("chats");
              }}
              portraits={chatPortraits(chat.participantCharacterIds, characterById)}
              selected={chat.id === activeChatId}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
