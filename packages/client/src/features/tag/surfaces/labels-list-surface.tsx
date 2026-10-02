// The Labels finder owns phone arrival; the visible library owns desktop arrival.

import { Button } from "@orb/ui/button";
import { Icon, MoreVertical, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Select } from "@orb/ui/select";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import { ListSearch, QueryBoundary } from "#components";
import { QueryErrorState } from "#data";
import { useFocusOnMount } from "#lib";
import { selectLabelFromList, setLabelFilter, setTagPruneConfirmOpen, useLabelFilter, useMobileViewport, useSectionListMode, useSelectedLabelId } from "#state";
import { TagCollectionRows } from "../components/tag-collection-rows.tsx";
import { useTagCensus, useTagSortControl } from "../hooks/use-tag-library.ts";
import { LABELS_FINDER_SLOT } from "../lib/labels-focus-targets.ts";

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
    <Container className="h-full" name="labels-finder">
      <Stack className="h-full min-h-0 outline-none" data-slot={LABELS_FINDER_SLOT} gap="block" ref={surfaceRef} tabIndex={-1}>
        <Row align="center" data-slot="labels-control-row" gap="field">
          <Row align="center" className="min-w-0 flex-1">
            <ListSearch>
              <Input aria-label="Filter labels" onValueChange={setLabelFilter} placeholder="Filter labels…" value={filter} />
            </ListSearch>
          </Row>
          <LabelsSortSelect />
          <LabelsOverflow />
        </Row>
        {empty ? (
          <Text voice="gloss" data-slot="labels-finder-empty">
            No labels yet.
          </Text>
        ) : null}
        {/* The rows' windowed arm takes its height from this box, so it is a bounded flex column. */}
        <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <QueryBoundary
            fallback={<Skeleton className="h-16 w-full" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="labels" onRetry={retry} />}
          >
            <TagCollectionRows view={{ selectedId, onSelect: selectLabelFromList, filter }} />
          </QueryBoundary>
        </Stack>
      </Stack>
    </Container>
  );
}

function LabelsSortSelect(): ReactElement {
  const sort = useTagSortControl();
  return (
    <Select
      aria-label="Sort labels"
      // @orb-waive ui-size-via-variant(w-auto): content-width Select leaves the row slack to its filter; auto overrides the standard w-full deterministically.
      className="w-auto"
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
          <Button aria-label="More label actions" intent="ghost" size="icon-sm">
            <Icon icon={MoreVertical} size="sm" />
          </Button>
        }
      />
      <MenuPopup align="end">
        <MenuItem onClick={(): void => setTagPruneConfirmOpen(true)}>
          <Icon icon={Trash2} size="sm" />
          Prune unused labels
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
