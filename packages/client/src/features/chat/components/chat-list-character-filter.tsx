// The chats pane's PER-CHARACTER narrowing chrome — the faces shortcut strip and the "Filtered: X ✕" chip.
//
// THE STRIP CARRIES NO FOLD OF ITS OWN (#1361 item 3 → #1718 arm A). #1361 gave it a phone `Collapsible`
// whose trigger named the scope in force; that principle survives and its input changed — the pane has ONE
// phone Filters row now (`chat-list-phone-filters.tsx`), because two stacked disclosures paid a 44px coarse
// trigger twice to carry two facts. This file is viewport-agnostic again: one strip, one printed kicker,
// rendered inside that panel on a phone and in the column on a desktop.
// Split out of `surfaces/chat-list-surface.tsx` under the 450-line component cap (UI-Architecture §2.1) when
// #490's filter work pushed that surface past it; a shortcut strip and a chip are components, and the
// surface keeps the composition. Both read and write the ONE narrowing store (`chat-list-filter-store`), so
// nothing is threaded through props that the store already carries.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { CharacterPicker, FaceStrip } from "#components";
import { useTRPC } from "#data";
import type { ChatListCharacterFilter } from "#state";
import { clearChatListCharacterFilter, setChatListCharacterFilter } from "#state";
import { recentFaces } from "../lib/recent-faces.ts";

/** How many recent chats the FACES curation reads. The strip answers "who was I just with", so a bounded
 *  recents page IS its question — and it must stay UNFILTERED (it is the thing you pick the filter from), so
 *  it cannot ride the pane's scoped collection. Thirty covers the narrow-pane fold contract; the overflow
 *  picker reaches the whole character library without enriching another 70 chat summaries. */
const FACES_SOURCE_LIMIT = 30;

/** The strip's one name — printed as its kicker and spoken as its accessible name. ONE string (#208): the
 *  strip announced "Recent characters" while the kicker printed something else, so AT and the eye were told
 *  about different lists. It names the STRIP; the phone Filters row that hosts it names the GROUP, and the
 *  two are different facts about different things (`phoneFiltersLabel`, `lib/chat-list-scope.ts`). */
const FACES_LABEL = "Filter by character";

/** Arm B — the faces strip: the pane learns FACES without the rail learning a new section. Tapping a face
 *  sets the LANDED per-character filter chip, so the same pane instantly becomes her threads, visibly
 *  "filtered by" (a chip you can clear) rather than a second list that owns her chats.
 *
 *  A plain bounded `useQuery`, NOT the pane's scoped collection: a shortcut row must not gate the pane's
 *  chrome on a fetch, and the strip is what you pick the filter FROM — reading the character-scoped page
 *  would collapse it to the one face already selected. An unresolved read RESERVES the strip's box
 *  (`pending` — measured: rendering nothing shoved the search field and the whole row list 74px on
 *  arrival); a resolved-but-faceless one still renders nothing, which is the strip's own data-driven
 *  empty posture.
 *
 *  The curation hands over the characters you have chatted with MOST RECENTLY, in recency order — the
 *  strip's own fold (FACEFILT) decides how many of them the pane can hold, so a cap here would only be a
 *  second, blinder answer to the same question. What the curation cannot know is the character you scoped
 *  the pane to from the picker: she may have no chats at all yet (that is the "No chats with X yet" arm), so
 *  she is prepended as a face — the strip must never be filtering by someone who is not in it. */
export function ChatListFacesStrip({ characterFilter }: { readonly characterFilter: ChatListCharacterFilter | null }): ReactElement | null {
  const trpc = useTRPC();
  const { data: page, isPending: chatsPending } = useQuery(trpc.chat.listChats.queryOptions({ limit: FACES_SOURCE_LIMIT }));
  // ONE read decides a face now (#192): the chat rows carry their own seats, so there is no second
  // `character.list` landing for the strip to pop in on — which is what the reservation used to have to
  // wait for as well. The scoped character still comes from the FILTER (she may have no chats at all yet,
  // and a row-sourced strip knows nothing about a character with no rows), so her face rides it too.
  const recent = recentFaces(page?.items ?? []);
  const scopedFace =
    characterFilter !== null && !recent.some((face) => face.id === characterFilter.id)
      ? [{ avatarHash: characterFilter.avatarHash, id: characterFilter.id, name: characterFilter.name }]
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
    setChatListCharacterFilter({ avatarHash: face.avatarHash, id: castId<CharacterId>(id), name: face.name });
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
  // AND IT IS THE STRIP'S ACCESSIBLE NAME TOO (#208). This call passed a SECOND string — the list announced
  // "Recent characters" while the kicker printed "Filter by character" — so AT and the eye were told about
  // different lists, and a speech-input user saying the words on screen addressed nothing. `kicker` is a
  // boolean now: `label` is the one name, printed and announced.
  //
  // The strip FOLDS to the pane (FACEFILT — the owner's nine scrolling faces on a six-character library):
  // the faces that fit stay a one-tap shortcut, and the rest of the characters live behind the tile, which opens
  // the house character picker over the WHOLE library — so it also reaches someone you have never opened a
  // chat with, which no amount of scrolling ever could.
  return (
    <FaceStrip
      caption={true}
      items={faces}
      kicker={true}
      label={FACES_LABEL}
      onSelect={scopeToFace}
      // RESERVE THE BOX WHILE THE READ IS IN FLIGHT (measured 2026-08-09: the pane shifted 74px on data
      // arrival — the strip mounted above the search field and pushed the field + the whole row list down,
      // §4.3 rule 7). `isPending` is "no answer yet", never "no faces": a settled empty answer still renders
      // nothing, which is this strip's own ruling.
      pending={chatsPending}
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
            onSelect={(id, name, avatarHash): void => {
              setChatListCharacterFilter({ avatarHash, id, name });
              close();
            }}
            placeholder="Search characters…"
            reserveKey="chat.listCharacterFilterPicker"
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

/** The active per-character scope, said out loud with its own way out — the chip half of the strip above. */
export function ChatListFilterChip({ filter }: { readonly filter: ChatListCharacterFilter }): ReactElement {
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
