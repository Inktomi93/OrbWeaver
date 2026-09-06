// The chats pane's PHONE FILTERS ROW — one disclosure over both narrowing controls (#1718 arm A,
// owner-ruled 2026-09-05).
//
// WHY IT EXISTS. The two secondary filters each folded behind a disclosure of their own: the month bound
// (#1350) and the faces strip (#1361 item 3). A `CollapsibleTrigger` is a `--spacing-control-sm` row, which
// is 44px at a coarse pointer, so the pane was spending 88px of trigger to carry two facts — measured, the
// second fold bought only 25px of the ~69px band it hid. One row, one trigger, both facts.
//
// #1350's PRINCIPLE SURVIVES, ITS INPUT CHANGED — the house idiom for a ruling that has to evolve. That
// ruling is "a disclosure whose TRIGGER carries the bound when one is set, so folding never hides state",
// and it still holds exactly: what changed is that ONE name now carries TWO states. The grammar, its
// derivation from the two trigger texts this replaces, and the four-state table are stated once at
// `phoneFiltersLabel` (`../lib/chat-list-scope.ts`) — never re-spelled here.
//
// THE RULING SURVIVES AGAIN, ITS INPUT CHANGED A SECOND TIME (#1735, side-eye 2026-09-05). Arm A's own
// "never hides state" reasoning was written for a bound with NO OTHER visible carrier — true of the month
// bound, false of the character axis: the `ChatListFilterChip` below (`Filtered: <name> ✕`) is ALWAYS on
// screen whenever a character filter is set, on this viewport exactly as much as on desktop (it lives
// outside this component's own applicability fence). So a trigger that ALSO spelled "with <name>" was not
// preventing a hidden state — it was a second sentence for a fact already on screen, the same one-fact-
// two-carriers shape #490 already ruled the ✕ belongs to. This component therefore passes `null` for the
// character half of `phoneFiltersLabel`: the trigger states only what has no other visible carrier (the
// month bound), and the chip keeps sole ownership of the character axis's name AND its only ✕.
// `phoneFiltersLabel` itself is UNCHANGED — its four-state grammar is a general "compose these clauses"
// contract, still exercised by `chat-list-scope.test.ts`; this is a call-site decision about which facts
// this ONE caller feeds it, not a rewrite of the function's own rule.
//
// NO NEW GRAMMAR INSIDE. The panel holds the SAME two components the desktop column holds, in the order the
// desktop shows them: the faces strip first (side-eye P2b — "the faces are the shortcut you arrive for"),
// the month bound under it. Neither knows it is in a panel; both were made viewport-agnostic again when
// their own folds came out.
//
// THE SEARCH FIELD IS NOT IN HERE, and that is the whole applicability argument: search is the primary of
// the three axes (#1350's own reasoning), so it stays on the pane where a reader reaches for it, and only
// the two secondaries fold. The "Filtered: X ✕" chip also stays outside — it is the character axis's WAY
// OUT (#490's one reset contract), and a way out behind a fold is not one.
//
// APPLICABILITY, NOT A MOBILE MODE ([[no-separate-reduced-modes]]): the desktop pane is a 300px column with
// vertical room to spare and nothing to buy back, so the surface renders the two controls outright there
// and this row never mounts.

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import type { ChatListCharacterFilter } from "#state";
import { useChatListMonth } from "#state";
import { formatMonthLabel, phoneFiltersLabel } from "../lib/chat-list-scope.ts";
import { ChatListFacesStrip } from "./chat-list-character-filter.tsx";
import { ChatListMonthFilter } from "./chat-list-month-filter.tsx";

export function ChatListPhoneFilters({ characterFilter }: { readonly characterFilter: ChatListCharacterFilter | null }): ReactElement {
  const month = useChatListMonth();
  const monthLabel = formatMonthLabel(month);
  return (
    // `defaultOpen` on ANY state already in force — the month bound's own reason (#1350), now spanning both
    // axes: arriving narrowed must not bury the reason the list is short. UNCONTROLLED past that first
    // commit on purpose: setting a filter INSIDE the panel must not re-open a panel the reader just closed,
    // and the trigger says what is in force either way.
    <Collapsible defaultOpen={monthLabel !== null || characterFilter !== null}>
      {/* `null` for the character half (#1735) — the `ChatListFilterChip` beside this row already
          carries `Filtered: <name> ✕`, so restating it here is a second sentence for one on-screen fact. */}
      <CollapsibleTrigger>{phoneFiltersLabel(null, monthLabel)}</CollapsibleTrigger>
      <CollapsiblePanel>
        <Stack gap="row">
          <ChatListFacesStrip characterFilter={characterFilter} />
          <ChatListMonthFilter />
        </Stack>
      </CollapsiblePanel>
    </Collapsible>
  );
}
