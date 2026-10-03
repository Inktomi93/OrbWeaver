// The Utility role as the surfaces that depend on it state it: Memory, the Corpus understanding pass and the paid-run
// confirm. Ready means a call would run now (the persisted resolve), never merely that a connection is picked: a
// binding to a row that has since lost background work is "set, but not running", and says why. The Rerank role
// reads through the same persisted resolve (`useRerankModel`), for Smart's default picker.

import type { Capability, RoutableTask } from "@orb/contracts/inference";
import { modelDisplayName } from "@orb/kit/model-name";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { connectionHost, connectionSummary, roleReadout, roleStatus, utilityReadsImages } from "#lib";

/** What a surface can truthfully say about a role's model: `unknown` while the read is pending or failed. */
type RoleModelState<Ready extends object = object> =
  | { readonly kind: "unknown" }
  | ({ readonly kind: "ready"; readonly label: string } & Ready)
  | { readonly kind: "unset" }
  | { readonly kind: "blocked"; readonly cause: string };

type UtilityModelState = RoleModelState<{ readonly readsImages: boolean }>;

/** A role's model from the same persisted resolve Model roles reads. Non-suspending, so a surface paints its own
 *  content first and never claims a state its read has not settled. `capability` rides a ready state for the
 *  caller that needs a fact of it. */
function useRoleModel(task: RoutableTask): RoleModelState<{ readonly capability: Capability }> {
  const trpc = useTRPC();
  const bindings = useQuery(trpc.connection.listBindings.queryOptions());
  const connections = useQuery(trpc.connection.list.queryOptions());
  const views = bindings.data;
  if (views === undefined) {
    return { kind: "unknown" };
  }
  const rows = connections.data ?? [];
  const rowOf = (connectionId: string): (typeof rows)[number] | undefined => rows.find((row) => row.id === connectionId);
  const view = views.find((candidate) => candidate.task === task) ?? null;
  const status = roleStatus(view);
  if (status === "unset") {
    return { kind: "unset" };
  }
  const resolved = view?.resolved ?? null;
  if (status === "running" && resolved !== null) {
    const row = rowOf(resolved.connectionId);
    return { kind: "ready", label: row === undefined ? modelDisplayName(resolved.model) : connectionSummary(row), capability: resolved.capability };
  }
  const readout = roleReadout({
    view,
    draftConnectionId: undefined,
    factsOf: (connectionId) => {
      const row = rowOf(connectionId);
      return row === undefined ? null : { label: connectionSummary(row), host: connectionHost(row.baseUrl) };
    },
  });
  return readout.kind === "blocked" ? { kind: "blocked", cause: readout.cause } : { kind: "unknown" };
}

/** The signed-in user's Utility model. */
export function useUtilityModel(): UtilityModelState {
  const state = useRoleModel("summarize");
  return state.kind === "ready" ? { kind: "ready", label: state.label, readsImages: utilityReadsImages(state.capability) } : state;
}

/** The signed-in user's Rerank model, which Smart's default picker ranks the characters with. */
export function useRerankModel(): RoleModelState {
  const state = useRoleModel("rerank");
  return state.kind === "ready" ? { kind: "ready", label: state.label } : state;
}

function callCount(calls: number): string {
  return `about ${calls} model ${calls === 1 ? "call" : "calls"}`;
}

/** The sentence a paid-run confirm leads with: the size of the run, and whether a Utility model can take it. A
 *  `recurring` run is a schedule's, so the size is per run, counted over the library as it stands today. */
export function modelRunCostSentence(calls: number, utility: UtilityModelState, recurring = false): string {
  const subject = recurring ? "Each run of this schedule" : "This";
  if (utility.kind === "unset") {
    return `${subject} needs ${callCount(calls)} on a Utility model, and none is set, so nothing can run until you pick one.`;
  }
  if (utility.kind === "blocked") {
    return `${subject} needs ${callCount(calls)} on your Utility model, which is set but not running: ${utility.cause}.`;
  }
  const model = utility.kind === "ready" ? `your Utility model, ${utility.label}` : "your Utility model";
  return `${subject} makes ${callCount(calls)} on ${model}. A hosted provider bills each one.`;
}
