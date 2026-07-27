// The Status tab (Context-Panel-Program §4.4 lite trim) — the roster's GAME-STATE lens (the roster IS the
// membership; this is not a second membership). Each roster actor renders: headshot portrait + name +
// className flavor + labeled pool MeterRows + condition chips. NO encounter block in lite (§4.4). Pools ARE
// the meters (no hp bar unless a pool is defined — nullable combat slots, §8 nullable-honesty).
//
// EDIT-in-place (§3.2): a pool value edits through `editSnapshot` — host-only in v1 (`canEditShared`), which
// also folds the read-only pill's honest-arms gate. The patch is a WHOLE-`actorState`-array overlay (the
// [merge-clear] contract merges top-level keys; an array leaf is replaced wholesale), rebuilt from the live
// volatile with the one pool's value swapped — the resolved snapshot is the source of truth the panel holds.

import type { RpgActorView, RpgSnapshotState } from "@orb/contracts/rpg";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { MeterRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot } from "../hooks/use-rpg-mutations";
import { trackColor } from "../lib/track-color";

/** Build the whole `actorState` overlay for `editSnapshot` with one actor's one pool value swapped. Every
 *  actor with volatile is re-sent (an array leaf is a full replace under [merge-clear]); the touched pool
 *  gets the new value, everything else rides forward unchanged. */
function poolPatch(actors: readonly RpgActorView[], actorKey: string, poolName: string, next: number): { readonly actorState: RpgSnapshotState["actorState"] } {
  const actorState = actors
    .filter((a): a is RpgActorView & { volatile: NonNullable<RpgActorView["volatile"]> } => a.volatile !== null)
    .map((a) => {
      const volatile = a.volatile;
      const key = `${a.actorRef.kind}:${a.name}`;
      if (key !== actorKey) {
        return volatile;
      }
      return {
        ...volatile,
        pools: volatile.pools.map((p) => (p.name === poolName ? { ...p, value: next } : p)),
      };
    });
  return { actorState };
}

export interface RpgStatusTabProps {
  readonly state: RpgPanelState;
}

/** The lite Status tab — the roster rows with pool meters + condition chips. */
export function RpgStatusTab({ state }: RpgStatusTabProps): ReactElement {
  const { tracker, canEditShared, chatId } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const editSnapshot = useEditSnapshot({ trpc, invalidation });

  if (tracker.actors.length === 0) {
    return <Text tone="muted">No one on the roster yet — add characters in Members.</Text>;
  }

  return (
    <Stack gap="section" data-slot="rpg-status-tab">
      <Text size="label" tone="muted" transform="caps" className="tracking-micro">
        Roster — {tracker.actors.length}
      </Text>
      {tracker.actors.map((actor) => (
        <RpgStatusRow
          key={`${actor.actorRef.kind}:${actor.name}`}
          actor={actor}
          {...(canEditShared
            ? {
                onEditPool: (poolName: string, next: number): void => {
                  editSnapshot.mutate({ chatId, patch: poolPatch(tracker.actors, `${actor.actorRef.kind}:${actor.name}`, poolName, next) });
                },
              }
            : {})}
        />
      ))}
    </Stack>
  );
}

interface RpgStatusRowProps {
  readonly actor: RpgActorView;
  readonly onEditPool?: (poolName: string, next: number) => void;
}

function RpgStatusRow({ actor, onEditPool }: RpgStatusRowProps): ReactElement {
  const volatile = actor.volatile;
  return (
    <Stack gap="field" data-slot="rpg-status-row" className="border-t border-border pt-row first:border-t-0 first:pt-0">
      <Row gap="block" align="center" justify="between">
        <Row gap="field" align="center" className="min-w-0">
          <Avatar size="sm" shape="rounded" alt={actor.name} hueSeed={actor.name} {...(actor.avatar === undefined ? {} : { src: actor.avatar })}>
            {actor.name.slice(0, 1).toUpperCase()}
          </Avatar>
          <Text as="span" size="label" weight="semibold" className="truncate">
            {actor.name}
          </Text>
        </Row>
        {actor.sheet.className === "" ? null : (
          <Text as="span" size="micro" tone="muted">
            {actor.sheet.className}
          </Text>
        )}
      </Row>

      {volatile === null || volatile.pools.length === 0
        ? null
        : volatile.pools.map((pool, i) => (
            <MeterRow
              key={pool.name}
              label={pool.name}
              value={pool.value}
              max={pool.max}
              color={trackColor(i)}
              {...(onEditPool === undefined ? {} : { onEditValue: (next: number): void => onEditPool(pool.name, next) })}
            />
          ))}

      {volatile === null || volatile.conditions.length === 0 ? null : (
        <Row gap="field" className="flex-wrap">
          {volatile.conditions.map((cond) => (
            <Badge key={cond.name} tone="soft" size="sm" intent="danger">
              {cond.name}
            </Badge>
          ))}
        </Row>
      )}
    </Stack>
  );
}
