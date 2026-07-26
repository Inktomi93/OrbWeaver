// The §4.3 categorized view — tags as collapsible category headers (Discord channel-category chevrons),
// an "Uncategorized" bucket at the tail. Renders the CURRENTLY-LOADED rows grouped (the sliding-window
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
import type { TagGroup } from "../lib/character-list-view";

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
      {groups.map((group) => (
        <Collapsible defaultOpen={true} key={group.tag === null ? UNCATEGORIZED_KEY : group.tag.id}>
          <CollapsibleTrigger
            chevron={false}
            render={
              <Button className="w-full justify-start" intent="ghost" size="sm">
                <Icon icon={ChevronDown} size="sm" />
                <Text as="span" size="micro" tone="muted" transform="caps">
                  {group.tag === null ? "Uncategorized" : group.tag.name}
                </Text>
                <Text as="span" size="micro" tone="muted">
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
