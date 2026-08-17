// Home's MASTHEAD line — chat-owned, for the same reason every other chat tile is: the sentence is about
// YOUR ROOMS ("Six rooms, still warm." / "You left off a week ago in The Ashen Spire."), and home imports
// zero features, so the only honest place to derive it is here. The alternative was a static "Home",
// which is the chrome this pass is deleting, not the copy it is adding.
//
// COPY REGISTER (#104): en-US, no em-dash, no SaaS voice — a warm plain sentence about a house you live
// in. Every number in it is DERIVED: the room count from the same `chat.listChats` page the recents tile
// reads (identical query key ⇒ one cache entry, no second fetch), the room name from `deriveChatTitle`
// through the shared `chatSummaryRowView`, the age from the shared relative-time formatter. Nothing here
// is a hardcoded six or a hardcoded week.
//
// IT IS HONEST AT THE EDGES. `RECENTS_LIMIT` is a page size, not a total, so a user with more rooms than
// the page holds gets "Eight rooms and more, still warm." rather than a count that quietly lies; a user
// with none gets an opening that fits an empty house. The subtitle disappears entirely when there is no
// room to have left off in — an absent fact prints nothing, never "You left off never".

import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { timeLib } from "#lib";
import { chatSummaryRowView } from "../lib/chat-summary-row.ts";
import { RECENTS_LIMIT } from "./home-recents-tile-body.tsx";

/** Counts up to ten spelled out — a masthead sentence reads as prose, and "6 rooms" in a warm line is a
 *  receipt, not a sentence. Past the page size the count stops being knowable, so the copy stops claiming
 *  one (see the header). */
const SPELLED = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"] as const;

function roomCountPhrase(count: number, paged: boolean): string {
  const word = SPELLED[count] ?? String(count);
  const noun = count === 1 ? "room" : "rooms";
  return paged ? `${word} ${noun} and more` : `${word} ${noun}`;
}

export function HomeMastheadBody(): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useSuspenseQuery(trpc.chat.listChats.queryOptions({ limit: RECENTS_LIMIT }));
  const rooms = page.items;
  const newest = rooms[0];
  const lastRoom = newest === undefined ? null : chatSummaryRowView(newest);
  return (
    <Stack gap="tight">
      <Heading level={1} voice="masthead">
        {rooms.length === 0 ? "An empty house." : `${roomCountPhrase(rooms.length, rooms.length === RECENTS_LIMIT)}, still warm.`}
      </Heading>
      <Text voice="reading">
        {lastRoom === null
          ? "Start a room and this is where you will find your way back into it."
          : `You left off ${timeLib.formatRelative(lastRoom.when)} in ${lastRoom.title}.`}
      </Text>
    </Stack>
  );
}
