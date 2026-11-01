// The Labels finder owns phone arrival; the visible library owns desktop arrival.

import { Button } from "@orb/ui/button";
import { Icon, MoreVertical, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Select } from "@orb/ui/select";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import { ListPage, QueryBoundary } from "#components";
import { QueryErrorState } from "#data";
import { useFocusOnMount } from "#lib";
import { selectLabelFromList, setLabelFilter, setTagPruneConfirmOpen, useLabelFilter, useMobileViewport, useSectionListMode, useSelectedLabelId } from "#state";
import { TagCollectionRows } from "../components/tag-collection-rows.tsx";
import { useTagCensus, useTagSortControl } from "../hooks/use-tag-library.ts";
import { LABELS_FINDER_SLOT } from "../lib/labels-focus-targets.ts";
import { TAG_FILTER_NAME } from "../lib/tag-list-name.ts";

export function LabelsListSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const phone = useMobileViewport();
  const listMode = useSectionListMode("corpus");
  useFocusOnMount(surfaceRef, phone && listMode !== "collapsed");
  const filter = useLabelFilter();
  const selectedId = useSelectedLabelId();
  // The rows say nothing over an empty library (a filter miss is theirs to say), so the finder does.
  const empty = useTagCensus() === 0;
  return (
    <ListPage
      data-slot={LABELS_FINDER_SLOT}
      filters={
        empty ? (
          <Text voice="gloss" data-slot="labels-finder-empty">
            No tags yet.
          </Text>
        ) : null
      }
      ref={surfaceRef}
      search={<Input aria-label={TAG_FILTER_NAME} onValueChange={setLabelFilter} placeholder={`${TAG_FILTER_NAME}…`} value={filter} />}
      searchAside={
        <>
          <LabelsSortSelect />
          <LabelsOverflow />
        </>
      }
    >
      <QueryBoundary
        fallback={<Skeleton className="block-(--height-row-placeholder) inline-full" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="tags" onRetry={retry} />}
      >
        <TagCollectionRows view={{ selectedId, onSelect: selectLabelFromList, filter }} />
      </QueryBoundary>
    </ListPage>
  );
}

function LabelsSortSelect(): ReactElement {
  const sort = useTagSortControl();
  return (
    <Select
      aria-label="Sort tags"
      // Content-width field Select leaves room for the filter; inline layout would also remove its field chrome.
      className="inline-auto"
      items={sort.options}
      onValueChange={(value): void => {
        if (value !== null) {
          sort.setMode(value);
        }
      }}
      value={sort.mode}
    />
  );
}

/** The library-level verb: its subject is the whole library, so it is not a row's. Destructive and mass, so
 *  the item only opens the rows' confirm. */
function LabelsOverflow(): ReactElement {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button aria-label="More tag actions" variant="ghost" size="sm" square={true}>
            <Icon icon={MoreVertical} size="sm" />
          </Button>
        }
      />
      <MenuPopup align="end">
        <MenuItem onClick={(): void => setTagPruneConfirmOpen(true)}>
          <Icon icon={Trash2} size="sm" />
          Prune unused tags
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
