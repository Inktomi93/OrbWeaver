// The §4.3 categorized view — tags as collapsible category headers (Discord channel-category chevrons),
// an "Uncategorized" bucket at the tail. C9-1d: a group's FIRST-paint expansion comes from its tag's
// `folderType` (`groupStartsOpen`) — this component is the tags-as-folders column's live reader. Renders the CURRENTLY-LOADED rows grouped (the sliding-window
// cache caps them at maxPages×PAGE_LIMIT, so a non-virtualized grouped render is bounded); a "Load more"
// button drives the SAME guarded tail-fetch the flat virtual list wires to `onEndApproach`, because a
// grouped list has no single scroll to trigger it. A character with 2+ tags appears under EACH group —
// selection is by character id (the row's own `onSelect`), so every instance highlights together.

import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { ChevronDown, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { TagGroup } from "../lib/character-list-view.ts";
import { groupStartsOpen } from "../lib/character-list-view.ts";

const UNCATEGORIZED_KEY = "__uncategorized";

export interface CharacterCategorizedListProps<T extends { readonly id: string }> {
  readonly groups: readonly TagGroup<T>[];
  readonly renderRow: (item: T) => ReactNode;
  readonly hasNextPage: boolean;
  readonly isLoadingMore: boolean;
  readonly onLoadMore: () => void;
}

/**
 * THE GROUPS DESCRIBED THE LOADED PAGE (#493, side-eye 2026-08-22 rail-characters P2-2) AND NOW THEY DESCRIBE
 * THE LIBRARY (#1696, side-eye 2026-09-05).
 *
 * #493's measurement stands and is worth keeping in front of whoever reads this next: on the owner's
 * 327-character library, switching Group on produced
 * `ADVENTURE 1 · CAN BE WHOLESOME, CAN BE SEXY 2 · FANTASY 1 · UNCATEGORIZED 27` — four counts summing to the
 * 30 rows paged in, presented as library facts, re-forming under the reader as scrolling pulled more rows.
 *
 * #493 CONSIDERED SERVER-SIDE COUNTS AND REFUSED THEM. Its refusal is preserved verbatim, because it is
 * still correct about the census it was offered: "the tag vocabulary read (`tag.listTagFilterVocabulary`)
 * carries a per-tag `characters` census, but it is a census over the LIBRARY, not over the current search +
 * chip lens, and there is no census at all for the Uncategorized bucket — which is the biggest number on
 * screen and the biggest lie. Printing a lens-blind census beside lens-filtered members would be a second
 * wrong answer with more authority than the first."
 *
 * THE RULING SURVIVES — ITS INPUT CHANGED. Both disqualifiers are facts about THAT read, not about the idea,
 * and `character.listTagGroups` (#1696) has neither: it counts through `ownedCharacterScope`, the same
 * predicate the page and `totalCount` share, and it answers the Uncategorized bucket as a first-class
 * member. What #493 shipped instead — the mode STATING its scope rather than pretending — is not discarded
 * either: it moves from one blanket sentence over all the buckets to the {@link GroupScopeNote} on each
 * bucket that is a window, which is the same honesty at the resolution the reader actually needs it.
 */
function GroupScopeNote({ loaded, total }: { readonly loaded: number; readonly total: number }): ReactElement {
  // Not `aria-hidden`: this IS the group's honesty, and unlike the flat list's foot line it does not sit
  // under a live region already speaking the same number.
  return <Text voice="gloss">{`${String(loaded)} of ${String(total)} loaded — keep scrolling, or filter by this tag to see them all.`}</Text>;
}

/** Grouped collapsible rows + a "Load more" tail-fetch. */
export function CharacterCategorizedList<T extends { readonly id: string }>({
  groups,
  renderRow,
  hasNextPage,
  isLoadingMore,
  onLoadMore,
}: CharacterCategorizedListProps<T>): ReactElement {
  return (
    <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="block">
      {/* C9-1d: the tag's `folderType` decides each group's FIRST paint (OPEN ⇒ expanded, plain/CLOSED ⇒
          collapsed behind its name + count) — `defaultOpen`, so the user's own toggle wins from then on and
          the section never fights them back. */}
      {groups.map((group) => (
        <Collapsible defaultOpen={groupStartsOpen(group.tag)} key={group.tag === null ? UNCATEGORIZED_KEY : group.tag.id}>
          <CollapsibleTrigger
            chevron={false}
            render={
              <Button className="w-full justify-start" intent="ghost" size="sm">
                {/* The chevron must SAY which way the section is (C9-1d): once `folderType` decides the
                    first paint, a collapsed group is an everyday state, and a chevron frozen pointing down
                    over a hidden panel is a lie. `CollapsibleTrigger` puts its `group` class + Base UI's
                    `data-panel-open` on this Button, so the leading icon rotates on open exactly like the
                    primitive's own baked (trailing) chevron does. */}
                <Icon className="transition-transform duration-(--motion-base) ease-out-expo group-data-[panel-open]:rotate-180" icon={ChevronDown} size="sm" />
                {/* The group header is a section NAME + its count: a kicker voice, and the count in the
                    `datum` voice (tabular mono) — density-pass §2.3. `interactiveKicker`, NOT `kicker`
                    (#1216 class, #1632 item 3): the name is the visible label of this CollapsibleTrigger, and
                    `kicker` rides `--text-micro` (10.5px), under the 11px functional floor for interactive
                    copy. Same tracked instrument register, readable 13px label step. */}
                <Text as="span" voice="interactiveKicker">
                  {group.tag === null ? "Uncategorized" : group.tag.name}
                </Text>
                {/* THE LIBRARY'S COUNT, not the page's (#1696). `total === null` is the census still in
                    flight: the header then prints NOTHING rather than the loaded length, because a number
                    that means "of what I have" wearing the place a library count goes is exactly the defect
                    — the rows below are still perfectly readable while it lands. */}
                {group.total === null ? null : (
                  <Text as="span" voice="datum">
                    {group.total}
                  </Text>
                )}
              </Button>
            }
          />
          <CollapsiblePanel>
            <Stack aria-label={group.tag === null ? "Uncategorized" : group.tag.name} gap="row" role="list">
              {group.items.map((item) => (
                <Row key={item.id}>{renderRow(item)}</Row>
              ))}
            </Stack>
            {/* A bucket the census names whose members are all still beyond the loaded window is a REAL
                bucket — that is the whole point of taking the headers from the server — so it says what it
                is instead of painting an empty panel that reads as a broken group. */}
            {group.total !== null && group.items.length < group.total ? <GroupScopeNote loaded={group.items.length} total={group.total} /> : null}
          </CollapsiblePanel>
        </Collapsible>
      ))}
      {hasNextPage ? (
        <Button disabled={isLoadingMore} intent="ghost" onClick={onLoadMore}>
          Load more
        </Button>
      ) : null}
    </Stack>
  );
}
