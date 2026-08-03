// ONE collection GROUP in the Configuration roster — the HOST half of the seam (config-rail-spec.md §2
// C-4/C-6): the band (disclosure · icon · kicker · count · create), the filter box, the empty slot, and the
// per-group QueryBoundary. Everything INSIDE the row area is the contribution's own render.
//
// GROUPS START COLLAPSED (owner ruling 2026-08-02, superseding the mocks' always-expanded drawing): a real
// library is not a glance — the owner's tag library is ~400 rows — so an expanded group would bury every
// sibling collection below its scroll and the roster would stop being the map of what EXISTS. The band is
// the map; expanding is one click, and the expanded set is remembered per device.
//
// THE BAND IS TWO SIBLING CONTROLS, never one nested pair: the disclosure is a button spanning the
// identity cluster, and the create `+` sits BESIDE it — a create button inside the disclosure button would
// be unclickable-by-spec (nested interactives) and unreadable to a screen reader.

import { Button } from "@orb/ui/button";
import { ChevronDown, ChevronRight, Icon, Plus, Search } from "@orb/ui/icons";
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
