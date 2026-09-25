// The "Other rooms" HOME tile body — the rooms you did NOT come back for, at list weight under the hearth
// hero (program #102, mockup variant C's second `.block`). It shipped titled "Also open" and was retitled
// by owner ruling 2026-08-17 (#150): rooms have no open/closed state, so that title named a property this
// product does not model. The file name and the `chat.alsoOpen` id keep the original spelling — see the
// contribution's header.
//
// WHY IT IS ITS OWN TILE AND NOT A BAND INSIDE THE RECENTS TILE (side-eye 2026-08-16 F6/F13). It shipped as
// a `<Section kicker>` nested in the recents body, which made it an `h3` inside the region named "Pick up
// where you left off" — so the page outline read h1 → h2 → h3 → h2×4 → h3, and a block that is a PEER of
// the other six announced as a child of one of them. The frame law says a tile does not draw its own title
// band, and the fix is not to draw a better one here: it is to be a tile. Which is also what the approved
// mock draws — two sibling `.block`s in the hearth column, the second one carrying "All chats →" on its own
// kicker row instead of on the hero's (F13: the pick-up row had the trailing link AND the "Chats" jump pill
// side by side, two labels for one destination on one line).
//
// ONE READ, TWO TILES. `trpc.chat.listChats` with the SAME `limit` is the SAME query key as the hero's, so
// this is one cache entry and one fetch — the split is presentational and costs no network. The hero takes
// `items[0]`; this takes the rest. The two cannot disagree about which room is the hero, because they are
// reading the same array.
//
// It suspends; home mounts every tile body inside its own `QueryBoundary`.

import type { ChatId } from "@orb/kit/ids";
import { Row, Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { selectChatFromList, setActiveSection } from "#state";
import { splitHearth } from "../lib/home-hearth.ts";
import { ChatSummaryRow } from "./chat-summary-row.tsx";
import { RECENTS_LIMIT } from "./home-recents-tile-body.tsx";

/** Selecting a recent is a CROSS-SECTION navigation: write chat's own selection AND move the rail to chats
 *  (`#state` module actions — §12's sanctioned channel; home never wires this). */
function openRecent(chatId: ChatId): void {
  selectChatFromList(chatId);
  setActiveSection("chats");
}

export function HomeAlsoOpenTileBody(): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useSuspenseQuery(trpc.chat.listChats.queryOptions({ limit: RECENTS_LIMIT }));
  const alsoOpen = splitHearth(page.items).rest;

  return (
    // `role="list"` needs `listitem` CHILDREN or the rows are generic to AT and the list announces empty —
    // the shared row's root is a plain div, so the role rides a layout-primitive wrapper (a literal <li>
    // would be invalid HTML under a div[role=list]). The list is NOT named here any more: the tile frame's
    // own `h2` names the region this list is the whole content of, and a second copy of that name on the
    // list itself made AT say it twice in a row.
    <Stack gap="tight" role="list">
      {alsoOpen.map((chat, index) => (
        // THE MOCK RULES A HAIRLINE BETWEEN ROOMS (side-eye F14 — `.also a{border-top:1px solid}` with
        // `:first-of-type{border-top:0}`). Six unruled rows at one weight read as a paragraph of rooms;
        // the rule is what makes each one a thing you can land on. It rides the row WRAPPER rather than a
        // `<Separator>` between rows, so a row's own hover tint paints inside its cell instead of the
        // separator floating in the gap — and the first row keeps the band's rule above it as its edge.
        <Row className={index === 0 ? "" : "border-border border-t pt-tight"} key={chat.id} role="listitem">
          <ChatSummaryRow
            chat={chat}
            onSelect={openRecent}
            portraits={chat.participantPortraits}
            // The ramp's `title` step, which had no other call site on this surface (F8): these rows ARE
            // home's content, not a directory of it, and the mock assigns them 16px.
            titleStep="promoted"
          />
        </Row>
      ))}
    </Stack>
  );
}
