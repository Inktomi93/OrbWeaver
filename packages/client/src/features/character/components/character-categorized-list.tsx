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

/** Grouped collapsible rows + a "Load more" tail-fetch. */
export function CharacterCategorizedList<T extends { readonly id: string }>({
  groups,
  renderRow,
  hasNextPage,
  isLoadingMore,
  onLoadMore,
}: CharacterCategorizedListProps<T>): ReactElement {
  return (
    <Stack className="min-h-0 flex-1 overflow-y-auto" gap="block">
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
