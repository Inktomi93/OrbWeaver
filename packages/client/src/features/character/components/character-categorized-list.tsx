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
  /** The SCOPE sentence the buckets below are true of (`partialGroupingLabel`), or `null` when the loaded
   *  set is the whole matched set (#493). See {@link PartialGroupingNotice}. */
  readonly partialNotice: string | null;
  readonly onLoadMore: () => void;
}

/**
 * THE GROUPS DESCRIBE THE LOADED PAGE, AND NOW THEY SAY SO (#493, side-eye 2026-08-22 rail-characters P2-2).
 *
 * Measured on the owner's 327-character library: switching Group on produced
 * `ADVENTURE 1 · CAN BE WHOLESOME, CAN BE SEXY 2 · FANTASY 1 · UNCATEGORIZED 27` — four counts summing to
 * the 30 rows paged in, presented as library facts. `ADVENTURE 1` reads as "you own one adventure
 * character" over a library with 551 tags, and the buckets re-form and re-count under the reader as
 * scrolling pages more rows in. A grouping whose buckets change while you look at them is worse than no
 * grouping, because it looks authoritative.
 *
 * The review offered two arms. Server-side group counts is the other one and it is NOT this: the tag
 * vocabulary read (`tag.listTagFilterVocabulary`) carries a per-tag `characters` census, but it is a census
 * over the LIBRARY, not over the current search + chip lens, and there is no census at all for the
 * Uncategorized bucket — which is the biggest number on screen and the biggest lie. Printing a
 * lens-blind census beside lens-filtered members would be a second wrong answer with more authority than
 * the first. So the honest arm ships: the mode states its scope, in the mode's own header, wherever the
 * loaded set is a strict subset of what matched.
 */
function PartialGroupingNotice({ notice }: { readonly notice: string }): ReactElement {
  return <Text voice="gloss">{notice}</Text>;
}

/** Grouped collapsible rows + a "Load more" tail-fetch. */
export function CharacterCategorizedList<T extends { readonly id: string }>({
  groups,
  renderRow,
  hasNextPage,
  isLoadingMore,
  partialNotice,
  onLoadMore,
}: CharacterCategorizedListProps<T>): ReactElement {
  return (
    <Stack className="relative min-h-0 flex-1 overflow-y-auto" gap="block">
      {partialNotice === null ? null : <PartialGroupingNotice notice={partialNotice} />}
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
                {/* The group header is a section NAME + its count: the `kicker` voice, and the count in the
                    `datum` voice (tabular mono) — density-pass §2.3. */}
                <Text as="span" voice="kicker">
                  {group.tag === null ? "Uncategorized" : group.tag.name}
                </Text>
                <Text as="span" voice="datum">
                  {group.items.length}
                </Text>
              </Button>
            }
          />
          <CollapsiblePanel>
            <Stack aria-label={group.tag === null ? "Uncategorized" : group.tag.name} gap="row" role="list">
              {group.items.map((item) => (
                <Row key={item.id}>{renderRow(item)}</Row>
              ))}
            </Stack>
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
