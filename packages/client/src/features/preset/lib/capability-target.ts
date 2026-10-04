// The capability panel's SWITCHER model: which connection the Params readout describes. A role resolves through
// the user's own bindings as a turn would; a connection names one row directly. Pure, so the Select's string
// values round-trip through one encoder and a removed connection is decided here, not in the component.

import type { CapabilityTarget, RoutableTask } from "@orb/contracts/inference";

/** The panel's default: what the next chat turn runs on. */
export const CHAT_ROLE_TARGET: CapabilityTarget = { kind: "role", task: "chat" };

/** The roles whose connection the funnel's sampling and effort apply to — the text-generation roles. */
export const SWITCHER_ROLES = ["chat", "summarize"] as const satisfies readonly RoutableTask[];

const ROLE_PREFIX = "role:";
const CONNECTION_PREFIX = "connection:";

/** The Select value for a target. */
export function targetValue(target: CapabilityTarget): string {
  return target.kind === "role" ? `${ROLE_PREFIX}${target.task}` : `${CONNECTION_PREFIX}${target.connectionId}`;
}

/** The target a Select value names, or `null` for a value this panel never offered. */
export function targetFromValue(value: string, connectionIds: readonly CapabilityTargetConnectionId[]): CapabilityTarget | null {
  if (value.startsWith(ROLE_PREFIX)) {
    const task = SWITCHER_ROLES.find((role) => `${ROLE_PREFIX}${role}` === value);
    return task === undefined ? null : { kind: "role", task };
  }
  const connectionId = connectionIds.find((id) => `${CONNECTION_PREFIX}${id}` === value);
  return connectionId === undefined ? null : { kind: "connection", connectionId };
}

type CapabilityTargetConnectionId = Extract<CapabilityTarget, { readonly kind: "connection" }>["connectionId"];

/** The target the reads run against: a connection that has left the user's list reads the chat role instead,
 *  and `removed` says so, so the panel can state it rather than describe a row that no longer exists. */
export function effectiveTarget(
  target: CapabilityTarget,
  connectionIds: readonly CapabilityTargetConnectionId[] | undefined,
): { readonly target: CapabilityTarget; readonly removed: boolean } {
  if (target.kind === "role" || connectionIds === undefined || connectionIds.includes(target.connectionId)) {
    return { target, removed: false };
  }
  return { target: CHAT_ROLE_TARGET, removed: true };
}
