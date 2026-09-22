// The pre-send verdict (#54): "would this task run RIGHT NOW without firing a turn?" Deterministic-only —
// a configured hosted row reads available and is never pre-flighted (a bad key still fails at send with
// the provider error). The causes, in the order they are decided: `no-connection` · `unavailable` (the
// wire's backend is not wired) · `runtime-missing` (the agent-sdk wire with no `claude` executable) ·
// `requirement-unmet` · `background-refused` · `endpoint-unreachable` (an `auth: endpoint` row whose
// reachability probe says down — a SLEEPING server on a row whose folded `features.sleep` is set reads
// AVAILABLE, it wakes on the turn; without it, sleeping IS down).

import type { SendAvailability } from "@orb/contracts/inference";
import { canFund } from "@orb/contracts/inference";
import type { BackendRegistry } from "../contract/backend.ts";
import { ProviderError } from "../contract/errors.ts";
import type { Resolved } from "../contract/resolved.ts";
import type { ReachabilityProbe } from "../contract/runtime.ts";
import type { ResolveArgs, ResolverContext } from "./resolve-task.ts";
import { NoConnectionError, resolveTask } from "./resolve-task.ts";

/** What the endpoint probe can say about a row's server — the axis, homed ONCE (§7.5). */
const UNAVAILABLE_RUNTIME: SendAvailability = { available: false, cause: "runtime-missing" };

async function resolveOrCause(ctx: ResolverContext, args: ResolveArgs): Promise<Resolved | SendAvailability> {
  try {
    return (await resolveTask(ctx, args)).resolved;
  } catch (err) {
    if (err instanceof NoConnectionError) {
      return { available: false, cause: "no-connection" };
    }
    if (err instanceof ProviderError && err.kind === "forbidden") {
      return { available: false, cause: "requirement-unmet" };
    }
    throw err;
  }
}

function staticVerdict(ctx: ResolverContext, registry: BackendRegistry, resolved: Resolved): SendAvailability | null {
  // The agent-sdk wire is UNBUILT exactly when the runtime is missing, so its cause is the actionable one
  // ("paste a token / install the runtime"), never the generic `unavailable`.
  if (resolved.wire === "agent-sdk" && ctx.deps.env.claudeExecutable === undefined) {
    return UNAVAILABLE_RUNTIME;
  }
  if (!registry.has(resolved.wire)) {
    return { available: false, cause: "unavailable" };
  }
  if (!resolved.requirement.ok) {
    return { available: false, cause: "requirement-unmet" };
  }
  if (!canFund(resolved, resolved.task)) {
    return { available: false, cause: "background-refused" };
  }
  return null;
}

function endpointVerdict(probe: ReachabilityProbe | undefined, resolved: Resolved): Promise<SendAvailability> {
  if (resolved.provider.auth !== "endpoint" || probe === undefined || resolved.baseUrl === null) {
    return Promise.resolve({ available: true });
  }
  return probe({
    baseUrl: resolved.baseUrl,
    secret: resolved.credential.secret,
    headers: resolved.transport?.headers,
    sleepPath: resolved.features.sleep?.isSleepingPath,
  }).then((state) => {
    const asleepWithoutWake = state === "asleep" && resolved.features.sleep === undefined;
    return state === "down" || asleepWithoutWake ? { available: false, cause: "endpoint-unreachable" } : { available: true };
  });
}

export async function checkAvailability(
  ctx: ResolverContext,
  registry: BackendRegistry,
  probe: ReachabilityProbe | undefined,
  args: ResolveArgs,
): Promise<SendAvailability> {
  const outcome = await resolveOrCause(ctx, args);
  if ("available" in outcome) {
    return outcome;
  }
  return staticVerdict(ctx, registry, outcome) ?? (await endpointVerdict(probe, outcome));
}
