// Explicit funder authority for runtime resolution; no credential or server service bag.

import type { AutomationRuleId, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";
import type { Principal } from "#identity";
import type { UserConnection } from "./connection.ts";
import type { BindingActor } from "./connection-ref.ts";
import type { SendAvailability } from "./resolved.ts";
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

/** Can the funder's task run under this fold, and if not, why. */
export type TaskAvailabilityOp = (params: ResolveTaskParams) => Promise<SendAvailability>;

/** The caller's persisted binding for one routable task, credential-free. */
export type GetBoundConnectionOp = (params: GetBoundConnectionParams) => Promise<BoundConnectionView | null>;

/** Does this user own this credential row? Answered by the credentials producer, asked by connection bindings. */
export type CredentialOwned = (ownerId: UserId, credentialId: UserCredentialId) => Promise<boolean>;

/** Is this automation rule authored by this user? Answered by automation, asked by connection bindings. */
export type RuleOwnedBy = (ruleId: AutomationRuleId, userId: UserId) => Promise<boolean>;
