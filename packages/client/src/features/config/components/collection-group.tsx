// ONE collection GROUP in the Configuration roster — the HOST half of the seam (config-rail-spec.md §2
// C-4/C-6): the band (disclosure · icon · kicker · count · create), the filter box, the empty slot, and the
// per-group QueryBoundary. Everything INSIDE the row area is the contribution's own render.
//
// GROUPS START COLLAPSED (owner ruling 2026-08-02, superseding the mocks' always-expanded drawing): a real
// library is not a glance — the owner's tag library is ~400 rows — so an expanded group would bury every
// sibling collection below its scroll and the roster would stop being the map of what EXISTS. The band is
// the map; expanding is one click, and the expanded set is remembered per device.
//
// THE BAND'S CONTROLS ARE SIBLINGS, never nested: the disclosure is a button spanning the identity cluster,
// and the trailing verbs (the optional IMPORT trigger, then the create `+`) sit BESIDE it — a button inside
// the disclosure button would be unclickable-by-spec (nested interactives) and unreadable to a screen
// reader. IMPORT leads CREATE because create is the primary and a primary sits last, hard against the
// trailing edge (the world-info list band's landed order, re-homed).

import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { ChevronDown, ChevronRight, Icon, Plus, Search, Upload } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";
import { QueryBoundary, QueryErrorState } from "#data";
import type { CollectionContribution } from "#lib";
import { COLLECTION_LARGE_GROUP } from "#lib";
import { selectCollectionMemberFromList, toggleCollectionGroup, useCollectionGroupOpen, useCollectionSelection } from "#state";

export interface CollectionGroupProps {
  readonly collection: CollectionContribution;
}

/** One group frame: the band, and — while expanded — the filter, the rows, or the empty slot. */
export function CollectionGroup({ collection }: CollectionGroupProps): ReactNode {
  // Every hook runs UNCONDITIONALLY over the door-frozen registry (the `useVisible` contract) — the
  // visibility verdict gates the RENDER, never the hook call.
  const visible = collection.useVisible?.() ?? true;
  const count = collection.useCount?.();
  const create = collection.create.useRun();
  const open = useCollectionGroupOpen(collection.id);
  const selection = useCollectionSelection();
  const [filter, setFilter] = useState("");
  const bodyId = useId();

  if (!visible) {
    return null;
  }

  const isEmpty = count === 0;
  return (
    <Stack gap="tight" data-slot="collection-group" data-collection={collection.id}>
      <Row align="center" gap="tight">
        <Button
          aria-controls={bodyId}
          aria-expanded={open}
          className="min-w-0 flex-1 justify-start"
          intent="ghost"
          onClick={(): void => toggleCollectionGroup(collection.id)}
          size="sm"
          type="button"
        >
          <Icon icon={open ? ChevronDown : ChevronRight} size="sm" />
          <Icon icon={collection.icon} size="sm" />
          <Text as="span" voice="kicker" className="truncate">
            {collection.label}
          </Text>
          {count === undefined ? null : (
            <Text as="span" voice="datum">
              {count}
            </Text>
          )}
        </Button>
        <CollectionImportTrigger collection={collection} />
        <Button aria-label={collection.create.label} intent="ghost" onClick={create} size="icon" title={collection.create.label} type="button">
          <Icon icon={Plus} size="sm" />
        </Button>
      </Row>
      <div id={bodyId} hidden={!open}>
        {open ? (
          <QueryBoundary
            fallback={<Skeleton className="h-16 w-full" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label={collection.label.toLowerCase()} onRetry={retry} />}
          >
            <CollectionGroupBody
              collection={collection}
              count={count}
              filter={filter}
              onFilterChange={setFilter}
              selectedId={selection?.kind === collection.id ? selection.memberId : null}
            />
          </QueryBoundary>
        ) : null}
      </div>
      {/* The EMPTY SLOT stays with the band, outside the disclosure: a zero-member group that only says so
          once expanded would read as a library the user has to open to learn is empty. */}
      {isEmpty ? <CollectionGroupEmpty collection={collection} onCreate={create} /> : null}
    </Stack>
  );
}

/** The group band's IMPORT door (D121-D `band=Import`) — rendered only for a collection that declares one.
 *  Split into its own component so the runner hook is called UNCONDITIONALLY inside it: whether a
 *  collection has an import door is a module-level BUILD fact (the definition is a static value), so the
 *  branch above the hook cannot change across renders — the same discipline the optional `useCount` call
 *  already relies on. */
function CollectionImportTrigger({ collection }: CollectionGroupProps): ReactNode {
  const door = collection.importFile;
  if (door === undefined) {
    return null;
  }
  return <CollectionImportDoor door={door} />;
}

function CollectionImportDoor({ door }: { readonly door: NonNullable<CollectionContribution["importFile"]> }): ReactElement {
  const run = door.useRun();
  return (
    <FileTrigger
      accept={door.accept}
      onFilesSelected={([file]): void => {
        if (file !== undefined) {
          run(file);
        }
      }}
    >
      {({ open }): ReactElement => (
        // `size="icon"` (not `sm`): an icon-only trigger in an `sm` box measures under the 44px coarse
        // floor — `size="icon"` is `size-control-md`, 34px fine / 48px coarse BY TOKEN (D62 P1).
        <Button aria-label={door.label} intent="ghost" onClick={open} size="icon" title={door.label} type="button">
          <Icon icon={Upload} size="sm" />
        </Button>
      )}
    </FileTrigger>
  );
}

interface CollectionGroupBodyProps {
  readonly collection: CollectionContribution;
  readonly count: number | undefined;
  readonly filter: string;
  readonly onFilterChange: (next: string) => void;
  readonly selectedId: string | null;
}

/** The expanded body: the host's filter box above the contribution's own rows. */
function CollectionGroupBody({ collection, count, filter, onFilterChange, selectedId }: CollectionGroupBodyProps): ReactElement {
  // The filter is COUNT-DRIVEN host chrome, not a per-collection special: any library past a glance earns
  // the same box, in the same place, with the same grammar.
  const filterable = (count ?? 0) > COLLECTION_LARGE_GROUP;
  return (
    <Stack gap="tight">
      {filterable ? (
        <Row align="center" gap="tight">
          <Icon icon={Search} size="sm" className="text-muted-foreground" />
          <Input
            aria-label={`Filter ${collection.label.toLowerCase()}`}
            onValueChange={onFilterChange}
            placeholder={`Filter ${collection.label.toLowerCase()}…`}
            value={filter}
          />
        </Row>
      ) : null}
      {collection.list({
        selectedId,
        onSelect: (memberId): void => selectCollectionMemberFromList(collection.id, memberId),
        filter: filterable ? filter : "",
      })}
    </Stack>
  );
}

/** The zero-member slot — the group keeps its band and says so, with its own create verb as the next step
 *  (empty states are load-bearing: a vanished group would make the roster's membership depend on data). */
function CollectionGroupEmpty({ collection, onCreate }: CollectionGroupProps & { readonly onCreate: () => void }): ReactElement {
  return (
    <Row align="center" className="rounded-control border border-input border-dashed px-field py-tight" gap="field">
      <Text voice="gloss">{collection.emptyText}</Text>
      <Button intent="ghost" onClick={onCreate} size="sm" type="button">
        {collection.create.label}
      </Button>
    </Row>
  );
}
