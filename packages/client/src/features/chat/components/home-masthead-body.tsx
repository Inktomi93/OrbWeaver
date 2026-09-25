// Home's MASTHEAD line — chat-owned, for the same reason every other chat tile is: the sentence is about
// YOUR ROOMS ("Six rooms, still warm." / "You left off a week ago."), and home imports
// zero features, so the only honest place to derive it is here. The alternative was a static "Home",
// which is the chrome this pass is deleting, not the copy it is adding.
//
// COPY REGISTER (#104): en-US, no em-dash, no SaaS voice — a warm plain sentence about a house you live
// in. Every number in it is DERIVED: the room count from the same `chat.listChats` page the recents tile
// reads (identical query key ⇒ one cache entry, no second fetch), the age off the viewer's own last turn
// (`ChatListPage.viewerLastTurnAt`, a census like the count), through the shared relative-time formatter.
// Nothing here is a hardcoded six or a hardcoded week.
//
// ONE RECENCY VOCABULARY (side-eye 2026-08-16 F4). Three renderings of the SAME instant were visible at
// once — "Aug 2, 2026" here, "1w ago" on the hero, "1w" on the rows — and the cause was not a second
// formatter: this line always called the client's one `timeLib` seam. It called `formatRelative`, whose
// kit implementation FALLS BACK to an absolute date past `RELATIVE_HORIZON_DAYS` (7), while both other
// sites call the horizon-less stamp form. The horizon is right for a row that has to stay honest about a
// two-year-old chat and wrong for the one sentence whose whole job is "how long has it been" — so the
// masthead takes the compact stamp plus the tense the sentence needs, and the three renderings become one.
// The kit horizon is deliberately NOT moved: it is correct everywhere else.
//
// …AND THE SENTENCE FORM READS "just now", NOT "now ago" (stickler 2026-08-16 F1). Composing
// `formatRelativeCompact` — which returns the WORD "now" for a sub-minute or future span — with a literal
// " ago" rendered "You left off now ago in …" the instant after you sent a message: the most common state
// this line is seen in. `formatRelativeAgo` is the kit's ONE sentence-ago form ("just now" sub-minute,
// "<stamp> ago" otherwise, still no horizon), so the tense is the kit's job and this site never spells it.
//
// IT COUNTS THE CENSUS, NEVER THE PAGE (review 2026-08-17 F3). This line used to count `items.length` and
// say "and more" whenever that hit `RECENTS_LIMIT` — which is a page size, not a total, so the ONE state
// where the hedge was wrong was the state it fired in most cleanly: a user with EXACTLY eight rooms read
// "Eight rooms and more, still warm." about a house with nothing else in it, and a user with eighty read
// the same sentence as a user with nine. `ChatListPage.totalCount` is a real server `COUNT` over the same
// scope this page windows (`domain/chat/contract/views.ts` documents it for exactly this), and it rides
// the SAME cache entry — so the honest number costs nothing and the hedge disappears with the lie it was
// covering. A user with none gets an opening that fits an empty house. The subtitle disappears entirely
// when there is no room to have left off in — an absent fact prints nothing, never "You left off never".

import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { timeLib } from "#lib";
import { isFirstRun } from "../lib/home-hearth.ts";
import { RECENTS_LIMIT } from "./home-recents-tile-body.tsx";

/** Counts up to ten spelled out — a masthead sentence reads as prose, and "6 rooms" in a warm line is a
 *  receipt, not a sentence. Past ten the numeral IS how the sentence reads ("Eighty-three" is not warmer
 *  than "83"), and the number is always knowable now (see the header — it is the census, not the page). */
const SPELLED = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"] as const;

function roomCountPhrase(count: number): string {
  const word = SPELLED[count] ?? String(count);
  return `${word} ${count === 1 ? "room" : "rooms"}`;
}

// The house the viewer walks into: empty, new to them, or theirs.
function mastheadTitle(totalCount: number, firstRun: boolean): string {
  if (totalCount === 0) {
    return "An empty house.";
  }
  return firstRun ? "Welcome in." : `${roomCountPhrase(totalCount)}, still warm.`;
}

// IT DATES THE VIEWER'S OWN LAST TURN, never a room's activity: a friend who has just joined has left off nowhere,
// and an account that spoke last week has not "left off" a minute ago because someone else posted.
function mastheadLine(viewerLastTurnAt: number | null, firstRun: boolean): string {
  if (firstRun) {
    return "Your room is below. Open it and say hello when you are ready.";
  }
  if (viewerLastTurnAt === null) {
    return "Start a room and this is where you will find your way back into it.";
  }
  return `You left off ${timeLib.formatRelativeAgo(viewerLastTurnAt)}.`;
}

export function HomeMastheadBody(): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useSuspenseQuery(trpc.chat.listChats.queryOptions({ limit: RECENTS_LIMIT }));
  const firstRun = isFirstRun(page);
  return (
    <Stack gap="tight">
      <Heading level={1} voice="masthead">
        {mastheadTitle(page.totalCount, firstRun)}
      </Heading>
      {/* IT NAMES THE INSTANT, NOT THE ROOM (rail sweep P2-6, 2026-08-17). This line read "You left off 2w
          ago in Example — The Ashen Spire." directly above a hero island whose own title is that room and
          whose credit line ended "· LAST TURN 2W AGO" — the same room name twice and the same instant
          twice, inside 90px. The split is by ownership: the HERO is the room (it is the control you press
          to go back into it), and this sentence is the one whose whole job is "how long has it been", so
          it keeps the recency and drops the name. The hero dropped the stamp in the same pass. */}
      <Text voice="reading">{mastheadLine(page.viewerLastTurnAt, firstRun)}</Text>
    </Stack>
  );
}
