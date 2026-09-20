// The §7.1 fold over `connection_bindings` for a turn funded by `funder` in the context of actor `actor`:
//   binding(actor, task) → binding(actor, ridesOn) → binding(funder, task) → binding(funder, ridesOn) → none
// One indexed lookup per hop, no JSON parse. `scope: "owner"` tasks (the vector space) ignore the actor ref —
// an owner has ONE space. A binding whose connection was deleted reads as `no-connection` (SET NULL), never a
// dangling id. There is NO born default (D142 retired, F2/F16): the fold ends at the funder's own rows.

import type { BindingActorKind, RoutableTask, Task } from "@orb/contracts/inference";
import { bindingTaskOf, isRoutableTask, TASK_DEFS } from "@orb/contracts/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import type { BindingActor, BindingStore } from "../deps.ts";

interface Hop {
  readonly actorKind: BindingActorKind;
  readonly actorId: string;
  readonly task: RoutableTask;
}

function actorHops(actor: BindingActor | undefined, tasks: readonly RoutableTask[]): readonly Hop[] {
  if (actor === undefined) {
    return [];
  }
  const actorId = actor.kind === "automation-rule" ? actor.ruleId : actor.pluginId;
  return tasks.map((task) => ({ actorKind: actor.kind, actorId, task }));
}

/** The routable tasks to try, most specific first: the task itself when routable, then what it rides. */
function taskLadder(task: Task): readonly RoutableTask[] {
  const rides = bindingTaskOf(task);
  return isRoutableTask(task) && task !== rides ? [task, rides] : [rides];
}

export interface FoldResult {
  readonly connectionId: UserConnectionId | null;
  /** Which hop answered — for the pane's "resolves through" readout and the trace. */
  readonly via: Hop | null;
}

export async function foldBindings(
  bindings: BindingStore,
  args: { readonly task: Task; readonly funder: UserId; readonly actor?: BindingActor | undefined },
): Promise<FoldResult> {
  const ladder = taskLadder(args.task);
  const scopeOwner = TASK_DEFS[args.task].scope === "owner";
  const hops: readonly Hop[] = [
    ...(scopeOwner ? [] : actorHops(args.actor, ladder)),
    ...ladder.map((task) => ({ actorKind: "user" as const, actorId: args.funder, task })),
  ];
  for (const hop of hops) {
    const row = await bindings.lookup(hop);
    if (row !== null && row.connectionId !== null) {
      return { connectionId: row.connectionId, via: hop };
    }
  }
  return { connectionId: null, via: null };
}
