// Explicit funder authority for runtime resolution; no credential or server service bag.

import type { UserConnectionId } from "@orb/kit/ids";
import type { Principal } from "#identity";
import type { UserConnection } from "./connection.ts";
import type { BindingActor } from "./connection-ref.ts";
import type { RoutableTask, Task } from "./tasks.ts";

/** `resolve` / `availability` — the runtime's fold for ONE task under the caller (the funder), optionally in the
 *  context of an actor (a rule, a plugin grant) or against an explicit row. */

export interface ResolveTaskParams {
  readonly principal: Principal;
  readonly task: Task;
  readonly actor?: BindingActor | undefined;
  readonly connectionId?: UserConnectionId | undefined;
}
/** Read the caller's persisted user-actor binding for one routable task. */
export interface GetBoundConnectionParams {
  readonly principal: Principal;
  readonly task: RoutableTask;
}

/** The credential-free binding projection used by the next-turn readout. */
export interface BoundConnectionView extends Pick<UserConnection, "label" | "providerId" | "model"> {
  readonly providerLabel: string;
}
