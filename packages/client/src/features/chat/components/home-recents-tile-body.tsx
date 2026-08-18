// The "Pick up where you left off" HOME tile body — chat-owned (home-section-spec §3.3): the tile belongs
// to the feature that owns the DATA and the INTENT, never to the host. Same `trpc.chat.listChats` query
// key as the chats pane, so there is one truth and `chatsChanged` freshness comes free, and the same
// `ChatSummaryRow` anatomy the pane and the character-chats projection render.
//
// IT IS A HERO PLUS A LIST NOW, NOT EIGHT EQUAL ROWS (2026-08-16, program #102 — the owner-picked Hearth
// Room). The finding was that the live conversations do not LEAD: eight of them sat in one island at one
// weight beside an explainer for throwaway rooms. Making the LIST louder was the obvious answer and the
// wrong one — you do not resume eight rooms, you resume one. So the newest room renders as the surface's
// single focal island (`HomeHearthRoom`) and the rest render as the dense ALSO-OPEN list underneath it,
// off the SAME page of the SAME query. One read, two weights.
//
// ONE BAND, ONE TILE (side-eye 2026-08-16 F6). This body used to draw the also-open list under a
// `<Section kicker>` of its own, which was "ordinary composition" and also an `h3` inside the region the
// frame names — a block that is a PEER of home's other six announcing as a child of one of them. The list
// is its own contribution now (`home-also-open-tile.tsx`), off the SAME query key, so the frame gives it
// the same h2 + named region every other block gets and the outline is flat. This body is the HERO alone.
//
// It ASKS FOR WHAT IT NEEDS (2026-08-09): `limit: RECENTS_LIMIT` rather than the whole membership list
// sliced to eight. `listChats` is keyset-paged and newest-CONVERSATION-first (#150 — it orders on the clock
// these rows display, `lastMessageAt ?? updatedAt`), so the first eight rows of page one
// ARE the eight recents — the tile used to pull every chat the user has (872 after a SillyTavern import) to
// render eight of them, and its own query key made that everyone else's cost too.
//
// It suspends; home mounts every tile body inside its own `QueryBoundary`, so a slow read here cannot
// blank the rest of home.
//
// Selecting a recent is a CROSS-SECTION navigation: the row writes chat's own selection AND moves the
// rail to chats (`#state` module actions — §12's sanctioned channel; home never wires this).

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { openNewChatPicker, selectChatFromList, setActiveSection } from "#state";
import { useChatPortraitMap } from "../hooks/use-chat-portrait-map.ts";
import { chatPortraits } from "../lib/chat-summary-row.ts";
import { HomeHearthRoom } from "./home-hearth-room.tsx";

/** How many recents this tile shows — AND, through the contribution's `skeletonRows`, how many rows its
 *  first-boot skeleton reserves (#92). Exported so the reservation cannot drift from the read. */
export const RECENTS_LIMIT = 8;

function openRecent(chatId: ChatId): void {
  selectChatFromList(chatId);
  setActiveSection("chats");
}

export function HomeRecentsTileBody(): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useSuspenseQuery(trpc.chat.listChats.queryOptions({ limit: RECENTS_LIMIT }));
  // ONE ENTITY, ONE FACE (#99 item 2). This tile rendered the SAME rows as the chats pane while omitting
  // `portraits`, so a 1:1 room with Kohaku showed Kohaku's portrait in the pane and a hue-seeded monogram
  // here — three surfaces' worth of "three treatments for one entity" traced to one missing prop, not to
  // three avatar components (there is exactly one). `useChatPortraitMap` is the SAME non-blocking read the
  // two chats panes already share (same query key ⇒ same cache entry, no second fetch): portraits are
  // decoration, so a slow or failed character read leaves the rows on their initials blob rather than
  // blocking home's tile. The HERO rides it too — the one room at focal weight is the last place that
  // should fall back to initials.
  const characterById = useChatPortraitMap();
  const hearth = page.items[0];

  if (hearth === undefined) {
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={(): void => openNewChatPicker()} size="sm">
            <Icon icon={Plus} size="sm" />
            New chat
          </Button>
        }
        description="Your threads land here the moment you start one."
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title="No chats yet"
      />
    );
  }

  return <HomeHearthRoom chat={hearth} onResume={openRecent} portraits={chatPortraits(hearth.participantCharacterIds, characterById)} />;
}
