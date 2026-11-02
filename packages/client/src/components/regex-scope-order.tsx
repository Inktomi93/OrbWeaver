// The regex EXECUTION-ORDER editor for one scope — the client half of `regex.applyScopeOrder`.
//
// WHY IT EXISTS: order is DATA, and it was unauthorable. Every `listFor*`/`listGlobal` read already comes
// back in junction-`position` order and `executeRegexScripts` applies its input list in that order, so
// "strip the tags BEFORE the rename runs" was a fact the server modelled, the router exposed, and no
// surface could say. `applyScopeOrder` shipped int-tested with zero client callers.
//
// ONE component for all four scopes, because ordering is one operation over four junctions (the verb's own
// shape). It owns ORDER ONLY — the host passes `renderItem`, so the picker's attach rows and the config
// rail's global readout keep their own anatomy and no row is re-spelled here.
//
// TWO MECHANISMS BY SIZE, NO CAPABILITY CLIFF (the tag-collection lesson, inverted):
//   • ≤ COLLECTION_LARGE_GROUP → `SortableList handle` — pointer drag plus dnd-kit's keyboard reorder
//     (Space · arrows · Space) and the mid-drag focus keeper, the AssemblyRack precedent.
//   • >  COLLECTION_LARGE_GROUP → the same rows with explicit per-row Move up / Move down buttons.
//     Dragging one row through thirty is not an affordance, but LOSING the ability to reorder is not an
//     answer either — the tag collection drops drag-reorder outright past this threshold and says nothing
//     (flagged, owner-unruled). Here only the MECHANISM changes; the capability holds at every size.
//   • < 2 rows → neither. A grip that cannot move anything still announces "Reorder <name>" to a screen
//     reader, which is a promise the list cannot keep.
// Deliberately NO `VirtualList` in the large arm: this editor is a SUB-SLICE of a list its host already
// renders unwindowed (the picker maps the whole library flat), so windowing it would put a second scroller
// inside a pane and lie about the page's real cost.
//
// The write is OPTIMISTIC, not just bus-driven. Every regex verb is `busDriven`, but a reorder's whole
// feedback IS the new row order: without the optimistic cache write the row a user just dropped snaps back
// to where it was until the bus tick lands.

import type { RegexAttachScope, RegexScriptRow } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronDown, ChevronUp, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { SortableItemKey } from "@orb/ui/sortable";
import { SortableList } from "@orb/ui/sortable";
import type { ReactElement, ReactNode } from "react";
import { useInvalidation, useTRPC } from "#data";
import { COLLECTION_LARGE_GROUP, regexScriptTitle } from "#lib";
import { useApplyRegexScopeOrder } from "./regex-mutations.ts";
import { ORDERABLE_MINIMUM } from "./regex-scope-order-model.ts";

export interface RegexScopeOrderProps {
  /** WHICH junction the rewrite addresses — the `@orb/contracts/regex` union the router validates. */
  readonly scope: RegexAttachScope;
  /** The scope's attachments in their CURRENT execution order (index 0 runs FIRST). Every `listFor*` read
   *  already orders by the junction `position`, so the caller passes its query data straight through. */
  readonly scripts: readonly RegexScriptRow[];
  /** The host's own row anatomy. The shell never draws a row — see the header. */
  readonly renderItem: (script: RegexScriptRow, index: number) => ReactNode;
}

export function RegexScopeOrder({ scope, scripts, renderItem }: RegexScopeOrderProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const apply = useApplyRegexScopeOrder({ trpc, invalidation });

  const commit = (orderedScriptIds: readonly RegexScriptId[]): void => {
    apply.mutate({ scope, orderedScriptIds: [...orderedScriptIds] });
  };

  // LIST SEMANTICS on every arm (side-eye 2026-08-06): the ordered slice is a RANKED list, and a ranked
  // list whose rank exists only as a visual number tells a screen reader nothing about where a row sits.
  // `role="list"` + `aria-posinset/setsize` is the `VirtualList`/`SortableList` shape, spelled here for the
  // two arms that are plain stacks rather than the seal.
  if (scripts.length < ORDERABLE_MINIMUM) {
    return (
      <Stack gap="field" role="list">
        {scripts.map((script, index) => (
          <Stack aria-posinset={index + 1} aria-setsize={scripts.length} key={script.id} role="listitem">
            {renderItem(script, index)}
          </Stack>
        ))}
      </Stack>
    );
  }

  if (scripts.length > COLLECTION_LARGE_GROUP) {
    const ids = scripts.map((script) => script.id);
    return (
      <Stack gap="field" role="list">
        {scripts.map((script, index) => (
          <Row align="center" aria-posinset={index + 1} aria-setsize={scripts.length} gap="field" key={script.id} role="listitem">
            <Stack className="flex-1 min-inline-0">{renderItem(script, index)}</Stack>
            <MoveControls count={scripts.length} index={index} onMove={(from, to): void => commit(reseat(ids, from, to))} script={script} />
          </Row>
        ))}
      </Stack>
    );
  }

  return (
    <SortableList
      getItemKey={(script: RegexScriptRow): SortableItemKey => script.id}
      handle={true}
      itemLabel={(script: RegexScriptRow): string => regexScriptTitle(script)}
      items={scripts}
      onReorder={(orderedKeys): void => {
        commit(orderedKeys.map((key) => typeIdSchema(ID_PREFIX.regexScript).parse(key)));
      }}
      renderItem={renderItem}
    />
  );
}

/** The large arm's per-row verbs. `focusableWhenDisabled` is load-bearing, not politeness: moving a row to
 *  an end disables the very button that was just pressed, and a plain `disabled` would drop focus to
 *  `<body>` mid-sequence — the same class of defect the sortable's mid-drag focus keeper exists for. */
function MoveControls({
  script,
  index,
  count,
  onMove,
}: {
  readonly script: RegexScriptRow;
  readonly index: number;
  readonly count: number;
  readonly onMove: (from: number, to: number) => void;
}): ReactElement {
  const name = regexScriptTitle(script);
  const isFirst = index === 0;
  const isLast = index === count - 1;
  return (
    <Row align="center" gap="tight">
      <Button
        aria-label={`Move ${name} up`}
        disabled={isFirst}
        focusableWhenDisabled={true}
        variant="ghost"
        onClick={(): void => onMove(index, index - 1)}
        square={true}
        type="button"
      >
        <Icon icon={ChevronUp} size="sm" />
      </Button>
      <Button
        aria-label={`Move ${name} down`}
        disabled={isLast}
        focusableWhenDisabled={true}
        variant="ghost"
        onClick={(): void => onMove(index, index + 1)}
        square={true}
        type="button"
      >
        <Icon icon={ChevronDown} size="sm" />
      </Button>
    </Row>
  );
}

/** The id order with the entry at `from` re-seated at `to`. Written as a filter + slice rather than a
 *  splice pair so it is TOTAL — no index read, so no `undefined` arm to guard against. */
function reseat(ids: readonly RegexScriptId[], from: number, to: number): readonly RegexScriptId[] {
  const rest = ids.filter((_, index) => index !== from);
  const moving = ids.slice(from, from + 1);
  return [...rest.slice(0, to), ...moving, ...rest.slice(to)];
}
