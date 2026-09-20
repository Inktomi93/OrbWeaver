// domain/connection/contract/results — verb result shapes. The row shapes themselves are the cross-boundary
// `UserConnection` / `ConnectionBinding` (`@orb/contracts/inference` — secret-free by construction: a row names
// its credential by id). What this file adds is the pane's DERIVED reads.

import type {
  Capability,
  ConnectionBinding,
  ModelCatalogEntry,
  ResolvedConnectionView,
  RoutableTask,
  Task,
  UnavailableCause,
  UserConnection,
} from "@orb/contracts/inference";
import type { ResolvedWarning } from "@orb/inference";

/** A connection row with what the pane renders beside it: the tasks it may serve and the provider's label. */
export interface ConnectionView extends UserConnection {
  readonly providerLabel: string;
  /** `connectionTasks(provider, kind)` — the Model-roles slots this row may be bound to. */
  readonly tasks: readonly Task[];
}

/** The capability read for one row (`runtime.capabilities.for`): the descriptor + the warnings it was
 *  synthesized with + the tasks. */
export interface ConnectionCapabilityView {
  readonly capability: Capability;
  /** The same evidence fold with this row's declaration omitted. */
  readonly baseline: Capability;
  readonly warnings: readonly ResolvedWarning[];
  readonly tasks: readonly Task[];
}

/** One Model-roles row: the actor's binding for a task AND what a turn resolves to RIGHT NOW against the
 *  PERSISTED read (§5.3a: "Not applied yet — a turn still uses …" is the readout this pair enables). */
export interface BindingView {
  /** One view per ROUTABLE task, bound or not — the pane renders every slot. */
  readonly task: RoutableTask;
  readonly binding: ConnectionBinding | null;
  readonly resolved: ResolvedConnectionView | null;
  /** The CLOSED cause union, not a free string: the pane turns it into a sentence, and an open discriminator
   *  on a display-bound field is how a raw `endpoint-unreachable` ends up on screen as a label. It was
   *  already `availability.cause` at the producer (`verbs/bindings.ts`); this only stops the type widening. */
  readonly unavailableCause: UnavailableCause | null;
}

export interface EndpointModelsResult {
  readonly listed: boolean;
  readonly models: readonly ModelCatalogEntry[];
  /** WHY the list came back empty when it did — the pane's copy for the typed-id fallback. */
  readonly reason: string | null;
}

export interface CatalogRefreshOutcome {
  readonly models: number | null;
}

/** The PD-139a trigger's CONDITION, snapshotted: `routable task -> resolved (model[@dtype]) space tag`, with
 *  `null` where nothing resolves (unbound / unservable / unfundable — a task with no vectors to strand).
 *  PARTIAL by construction: `substrate/embed-space.ts` fills exactly the VECTOR tasks, so a lookup for any
 *  other routable task is `undefined` rather than a lie about a space it never resolved. */
export type EmbedSpaces = Readonly<Partial<Record<RoutableTask, string | null>>>;

export type { CredentialHealth } from "@orb/contracts/credentials";
export type { ProviderAvailability } from "@orb/contracts/inference";
