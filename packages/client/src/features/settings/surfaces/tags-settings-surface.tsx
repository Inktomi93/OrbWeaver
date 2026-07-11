// The TAGS settings surface (Settings → USER → Tags — Task #65) — the tag-management screen. Lists every
// owned tag with its five-junction usage rollup (`tag.listTagsWithUsage`), each row exposing the full tag
// domain: rename · color/color2 · folder-type · hide-on-card · Merge into… · Delete (tag-settings-row.tsx),
// plus drag-reorder (SortableList → setTagOrder) and a "Prune unused" action. Deliberately NOT a re-import
// of a character/tag feature internal — there is no client tag FEATURE; this pane talks to `trpc.tag.*`
// directly, the same "cross-feature reads ride trpc.*" seam every other settings pane uses.
//
// INVALIDATION (PD user-bus lane — busDriven): every tag verb emits `tagsChanged`, and
// `USER_BUS_FILTERS.tagsChanged` path-invalidates the whole `tag` router (covers `listTagsWithUsage`) — an
// always-on subscription (home-page.tsx), so the echo reconciles the acting device (a self-invalidate
// would double-refetch). The mutations therefore carry no `invalidates` of their own
// (use-tag-settings-mutations.ts).

import type { TagWithUsage } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { TagSettingsRow } from "../components/tag-settings-row";
import { usePruneUnusedTags, useSetTagOrder } from "../hooks/use-tag-settings-mutations";
import { TAGS_SUBCATEGORY_IDS } from "../lib/settings-nav";
import { settingsAnchorId } from "../lib/settings-nav-model";

/** The Tags pane body (rendered inside the settings modal's category column). */
export function TagsSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading your tags…</Text>}
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load your tags.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
        )}
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
          Rename, recolor, reorder, merge, or delete the labels you tag characters, chats, world
          books, personas, and presets with. Drag the handle to reorder.
        </Text>
        <Button
          intent="secondary"
          size="sm"
          disabled={!hasUnused}
          onClick={(): void => prune.mutate()}
        >
          Prune unused
        </Button>
      </Row>

      {tags.length === 0 ? (
        <Text tone="muted">
          You have no tags yet. Tag a character, chat, world book, persona, or preset and it shows
          up here.
        </Text>
      ) : (
        <SortableList
          handle={true}
          items={tags}
          getItemKey={(tag: TagWithUsage): string => tag.id}
          onReorder={(orderedKeys): void =>
            setOrder.mutate({ orderedIds: orderedKeys.map((key) => key as TagId) })
          }
          renderItem={(tag: TagWithUsage): ReactElement => (
            <TagSettingsRow
              invalidation={invalidation}
              others={tags.filter((other) => other.id !== tag.id)}
              tag={tag}
              trpc={trpc}
            />
          )}
        />
      )}
    </Section>
  );
}
