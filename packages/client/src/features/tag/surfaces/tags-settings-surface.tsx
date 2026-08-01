// The Tags settings surface — the tag-management screen. Lists every owned tag with its usage rollup,
// each row exposing the full tag domain: rename, colors, folder-type, hide-on-card, merge, delete, plus
// drag-reorder and a "Prune unused" action. Talks to trpc.tag.* — this IS the tag feature (D114).

import type { TagWithUsage } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { settingsAnchorId } from "#state";
import { TagCreateButton } from "../components/tag-create-button";
import { TagSettingsRow } from "../components/tag-settings-row";
import { usePruneUnusedTags, useSetTagOrder } from "../hooks/use-tag-settings-mutations";
import { TAGS_SUBCATEGORY_IDS } from "../lib/tags-nav";

export function TagsSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading your tags…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your tags" onRetry={retry} />}
      >
        <TagsSettingsList />
      </QueryBoundary>
    </Stack>
  );
}

function TagsSettingsList(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const setOrder = useSetTagOrder({ trpc, invalidation });
  const prune = usePruneUnusedTags({ trpc, invalidation });

  const hasUnused = tags.some((tag) => tag.usage.total === 0);

  return (
    <Section heading="Tags" divider={true} id={settingsAnchorId("tags", TAGS_SUBCATEGORY_IDS.tags)}>
      <Row gap="field" align="center" justify="between" className="flex-wrap">
        <Text size="micro" tone="muted">
          Rename, recolor, reorder, merge, or delete the labels you tag characters, chats, world books, personas, and presets with. Drag the handle to reorder.
        </Text>
        <Row gap="field" align="center">
          <Button intent="secondary" size="sm" disabled={!hasUnused} onClick={(): void => prune.mutate()}>
            Prune unused
          </Button>
          <TagCreateButton trpc={trpc} />
        </Row>
      </Row>

      {tags.length === 0 ? (
        <Text tone="muted">You have no tags yet. Tag a character, chat, world book, persona, or preset and it shows up here.</Text>
      ) : (
        <SortableList
          handle={true}
          items={tags}
          getItemKey={(tag: TagWithUsage): string => tag.id}
          onReorder={(orderedKeys): void => setOrder.mutate({ orderedIds: orderedKeys.map((key) => key as TagId) })}
          renderItem={(tag: TagWithUsage): ReactElement => (
            <TagSettingsRow invalidation={invalidation} others={tags.filter((other) => other.id !== tag.id)} tag={tag} trpc={trpc} />
          )}
        />
      )}
    </Section>
  );
}
