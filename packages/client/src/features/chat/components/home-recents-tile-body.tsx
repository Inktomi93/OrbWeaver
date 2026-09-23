// The "Pick up where you left off" HOME tile body — chat-owned: the tile belongs
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

import { blobUrl } from "@orb/contracts/assets";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { openNewChatPicker, selectChatFromList, setActiveSection } from "#state";
import { usePrefetchRoom } from "../hooks/use-prefetch-room.ts";
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
  // THE DOOR WARMS THE ROOM'S ROSTER (#1126, side-eye HOME H13). "Resume" is this surface's one focal
  // action and it used to enter a room whose roster read was cold, so the character strip appeared only
  // after the transcript had painted and pushed it down 52px. The hook warms `chat.getChat` and nothing
  // else — the owner ruled the skeleton phase STAYS (its header carries the measured trade) — and it runs
  // BEFORE the early return below so the hook order is the same on the empty-hearth arm, which warms
  // nothing.
  usePrefetchRoom(page.items[0]?.id ?? null);
  // THE HERO'S ART BLEED (#205; the 3-face cover-crop STRIP it replaced stays deleted). It renders one
  // portrait as chroma at the island's far edge — `aria-hidden` art, no character datum at all. Since #192 the
  // face rides the chat ROW itself, so it costs no network at all: the whole-library `character.list` read
  // this used to index into is gone, and a room whose seats have no portrait simply has no bleed.
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

  // The room's ART is its FIRST SEAT that has one — the same "one room, one face" rule the shared summary
  // row applies to a single-avatar chat, so the island and the rows below it never disagree about which
  // portrait represents a room. Seats with no portrait are skipped rather than ending the search: a room
  // whose lead character has no card image still has a face to show if anyone else in it does.
  const artHash = hearth.participantPortraits.find((seat) => seat.avatarHash !== null)?.avatarHash ?? null;

  return <HomeHearthRoom artSrc={artHash === null ? undefined : blobUrl(artHash)} chat={hearth} onResume={openRecent} />;
}
