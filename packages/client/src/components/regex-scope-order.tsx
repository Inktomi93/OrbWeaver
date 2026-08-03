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
import { Button } from "@orb/ui/button";
import { ChevronDown, ChevronUp, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { SortableItemKey } from "@orb/ui/sortable";
import { SortableList } from "@orb/ui/sortable";
import type { QueryKey } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { COLLECTION_LARGE_GROUP, regexScriptTitle } from "#lib";

/** Two rows is the floor for an order to exist at all. */
const ORDERABLE_MINIMUM = 2;

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

  if (scripts.length < ORDERABLE_MINIMUM) {
    return <Stack gap="field">{scripts.map((script, index) => renderItem(script, index))}</Stack>;
  }

  if (scripts.length > COLLECTION_LARGE_GROUP) {
    const ids = scripts.map((script) => script.id);
    return (
      <Stack gap="field">
        {scripts.map((script, index) => (
          <Row align="center" gap="field" key={script.id}>
            <Stack className="min-w-0 flex-1">{renderItem(script, index)}</Stack>
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
      handleLabel={(script: RegexScriptRow): string => `Reorder ${regexScriptTitle(script)}`}
      items={scripts}
      onReorder={(orderedKeys): void => {
        commit(orderedKeys.map((key) => key as RegexScriptId));
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
        intent="ghost"
        onClick={(): void => onMove(index, index - 1)}
        size="icon"
        type="button"
      >
        <Icon icon={ChevronUp} size="sm" />
      </Button>
      <Button
        aria-label={`Move ${name} down`}
        disabled={isLast}
        focusableWhenDisabled={true}
        intent="ghost"
        onClick={(): void => onMove(index, index + 1)}
        size="icon"
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

/** WHICH read the rewrite is authoritative for — one key per scope arm, exhaustive so a fifth scope is a
 *  compile error rather than a reorder that silently paints stale. */
function scopeReadKey(trpc: Trpc, scope: RegexAttachScope): QueryKey {
  switch (scope.kind) {
    case "global":
      return trpc.regex.listGlobal.queryKey();
    case "character":
      return trpc.regex.listForCharacter.queryKey({ characterId: scope.characterId });
    case "preset":
      return trpc.regex.listForPreset.queryKey({ presetId: scope.presetId });
    case "chat":
      return trpc.regex.listForChat.queryKey({ chatId: scope.chatId });
    default:
      return assertNeverScope(scope);
  }
}

function assertNeverScope(scope: never): never {
  throw new Error(`unhandled regex attach scope: ${JSON.stringify(scope)}`);
}

/** The cached list re-sorted by the order being written. Ids the read doesn't carry are dropped and rows
 *  the write doesn't name keep their relative tail — the verb's own posture (`apply-scope-order.ts`), so
 *  the optimistic paint and the server's answer agree. */
function applyOrder(rows: readonly RegexScriptRow[], orderedIds: readonly RegexScriptId[]): RegexScriptRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const named = new Set(orderedIds);
  const moved = orderedIds.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
  return [...moved, ...rows.filter((row) => !named.has(row.id))];
}

// TVars is spelled from the CONTRACT union, not `inferInput`: the router validates `scope` through
// `typeIdSchema`, whose transform-backed arms infer as `unknown`-fielded — so the inferred input would
// erase exactly the branding that makes `scopeReadKey` exhaustive and type-safe. The stricter shape stays
// assignable to the proc's own input, so nothing is cast.
const useApplyRegexScopeOrder = createEntityMutation<
  { readonly scope: RegexAttachScope; readonly orderedScriptIds: RegexScriptId[] },
  inferOutput<Trpc["regex"]["applyScopeOrder"]>,
  RegexScriptRow[]
>({
  options: (trpc) => trpc.regex.applyScopeOrder.mutationOptions(),
  busDriven: true, // applyScopeOrder emits regexChanged → the invalidation map covers regex.pathFilter().
  optimistic: {
    readKey: (trpc, vars) => scopeReadKey(trpc, vars.scope),
    update: (old, vars) => (old === undefined ? old : applyOrder(old, vars.orderedScriptIds)),
  },
  errorToast: "Couldn't save that run order.",
});
