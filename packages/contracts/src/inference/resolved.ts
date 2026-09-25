// The credential-FREE projection of a resolved connection — what `connection.resolveChatCapability` hands
// the client and what every domain reads. The full `Resolved<Task>` (credential, base URL, folded
// features, extras, transport) lives in `@orb/inference`'s contract: it carries a secret, and this module
// must stay importable by a bus contract (D16 fences the secret-bearing shapes to `#credentials`).

import type { ModelId, UserConnectionId } from "@orb/kit/ids";
import type { ChatApi } from "./apis.ts";
import type { Capability, RequirementVerdict } from "./capability/index.ts";
import type { ProviderDef, ProviderId } from "./provider-schema.ts";
import type { Task } from "./tasks.ts";
import type { Wire } from "./wires.ts";

export interface ResolvedConnectionView {
  readonly task: Task;
  readonly connectionId: UserConnectionId;
  readonly providerId: ProviderId;
  readonly wire: Wire;
  /** The chat protocol the turn is addressed by; `null` for a non-chat kind (embedding/rerank rows have none). */
  readonly api: ChatApi | null;
  readonly model: ModelId;
  readonly capability: Capability;
  /** Whether the task's `requires` clause holds on this row — a verdict, never a throw. */
  readonly requirement: RequirementVerdict;
}

/** Why a task cannot be served deterministically right now — the composer's pre-send verdict (#54), the
 *  picker's row state. `no-connection` = no binding in the fold or the bound row was deleted/unset;
 *  `endpoint-unreachable` = reachability says down or a wake timed out (renamed from `engine-down`);
 *  `runtime-missing` = the wire's runtime is absent on this box (the bundled `claude` executable does not
 *  resolve; renamed from `host-claude`); `background-refused` = a background task on a row whose
 *  `allowBackground` is off (`canFund`); `requirement-unmet` = the row's model cannot do the task;
 *  `unavailable` = the wire's backend is not wired (an operator error); `model-load-failed` = the in-process
 *  model's latest load failed (the next call retries it). `engine-off` is RETIRED: no row is
 *  `no-connection` like every other absence. */
export const UNAVAILABLE_CAUSES = [
  "no-connection",
  "endpoint-unreachable",
  "runtime-missing",
  "background-refused",
  "requirement-unmet",
  "unavailable",
  "model-load-failed",
] as const;
export type UnavailableCause = (typeof UNAVAILABLE_CAUSES)[number];

export type SendAvailability = { readonly available: true } | { readonly available: false; readonly cause: UnavailableCause };

/** What the picker may OFFER, per provider row (§3.3 `providers.available`): a row on a wire whose backend is
 *  not built reads `unavailable`; `claude-sub` with no `claude` executable reads `runtime-missing` and renders
 *  DISABLED with its reason (§5.3a). The picker never offers a source that is not wired. */
export interface ProviderAvailability {
  readonly provider: ProviderDef;
  readonly available: boolean;
  readonly cause?: Extract<UnavailableCause, "unavailable" | "runtime-missing"> | undefined;
}
