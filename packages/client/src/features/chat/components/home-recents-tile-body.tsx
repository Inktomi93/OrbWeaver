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
// Two bands, one tile: the frame's own kicker names the block ("Pick up where you left off"), and the
// dense list gets a `<Section kicker>` of its own — a body with internal groupings is ordinary
// composition, and the frame law it must not break is "a tile does not draw its OWN title band", which it
// does not. The band is DATA-CONDITIONAL: with one room open there is nothing else to be also-open, and a
// band over an empty list is the kind of chrome this pass exists to delete.
//
// It ASKS FOR WHAT IT NEEDS (2026-08-09): `limit: RECENTS_LIMIT` rather than the whole membership list
// sliced to eight. `listChats` is keyset-paged and newest-updated-first, so the first eight rows of page one
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
import { Row, Section, Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { openNewChatPicker, selectChatFromList, setActiveSection } from "#state";
import { useChatPortraitMap } from "../hooks/use-chat-portrait-map.ts";
import { chatPortraits } from "../lib/chat-summary-row.ts";
import { ChatSummaryRow } from "./chat-summary-row.tsx";
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
  const recents = page.items;
  const [hearth, ...alsoOpen] = recents;

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

  return (
    <Stack gap="section">
      <HomeHearthRoom chat={hearth} onResume={openRecent} portraits={chatPortraits(hearth.participantCharacterIds, characterById)} />
      {alsoOpen.length === 0 ? null : (
        <Section kicker="Also open">
          {/* `role="list"` needs `listitem` CHILDREN or the rows are generic to AT and the list announces
              empty — the shared row's root is a plain div, so the role rides a layout-primitive wrapper
              (the `import-report-summary` precedent; a literal <li> would be invalid HTML under a
              div[role=list]). */}
          <Stack aria-label="Also open" gap="row" role="list">
            {alsoOpen.map((chat) => (
              <Row key={chat.id} role="listitem">
                <ChatSummaryRow chat={chat} onSelect={openRecent} portraits={chatPortraits(chat.participantCharacterIds, characterById)} />
              </Row>
            ))}
          </Stack>
        </Section>
      )}
    </Stack>
  );
}
