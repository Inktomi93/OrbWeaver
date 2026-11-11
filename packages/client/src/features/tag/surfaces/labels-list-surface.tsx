// The Labels finder owns phone arrival; the visible library owns desktop arrival.

import { Button } from "@orb/ui/button";
import { EllipsisVertical, Icon, Trash } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Select } from "@orb/ui/select";
import type { ReactElement } from "react";
import { useRef } from "react";
import { LibrarySurfaceShell, ListPage } from "#components";
import { useFocusOnMount } from "#lib";
import { selectLabelFromList, setLabelFilter, setTagPruneConfirmOpen, useLabelFilter, useMobileViewport, useSectionListMode, useSelectedLabelId } from "#state";
import { TagCollectionRows } from "../components/tag-collection-rows.tsx";
import { useTagSortControl } from "../hooks/use-tag-library.ts";
import { LABELS_FINDER_SLOT } from "../lib/labels-focus-targets.ts";
import { TAG_FILTER_NAME, TAG_MORE_ACTIONS_NAME, TAG_PRUNE_NAME, TAG_SKIP_NAME, TAG_SORT_NAME } from "../lib/tag-list-name.ts";

export function LabelsListSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const phone = useMobileViewport();
  const listMode = useSectionListMode("corpus");
  useFocusOnMount(surfaceRef, phone && listMode !== "collapsed");
  const filter = useLabelFilter();
  const selectedId = useSelectedLabelId();
  return (
    <ListPage
      data-slot={LABELS_FINDER_SLOT}
      ref={surfaceRef}
      search={<Input aria-label={TAG_FILTER_NAME} onValueChange={setLabelFilter} placeholder={`${TAG_FILTER_NAME}…`} value={filter} />}
      skipTo={TAG_SKIP_NAME}
      searchAside={
        <>
          <LabelsSortSelect />
          <LabelsOverflow />
        </>
      }
    >
      <LibrarySurfaceShell errorLabel="tags" loadingLabel="Loading tags…" resetKeys={[]}>
        <TagCollectionRows view={{ selectedId, onSelect: selectLabelFromList, filter }} />
      </LibrarySurfaceShell>
    </ListPage>
  );
}

function LabelsSortSelect(): ReactElement {
  const sort = useTagSortControl();
  return (
    <Select
      aria-label={TAG_SORT_NAME}
      // Content-width field Select leaves room for the filter; inline layout would also remove its field chrome.
      layout="hug"
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
          <Button aria-label={TAG_MORE_ACTIONS_NAME} variant="ghost" size="sm" square={true}>
            <Icon icon={EllipsisVertical} size="sm" />
          </Button>
        }
      />
      <MenuPopup align="end">
        <MenuItem onClick={(): void => setTagPruneConfirmOpen(true)}>
          <Icon icon={Trash} size="sm" />
          {TAG_PRUNE_NAME}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
