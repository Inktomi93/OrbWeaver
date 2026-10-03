// domain/connection/contract/results — verb result shapes. The row shapes themselves are the cross-boundary
// `UserConnection` / `ConnectionBinding` (`@orb/contracts/inference` — secret-free by construction: a row names
// its credential by id). What this file adds is the pane's DERIVED reads. Each strict schema is its procedure's tRPC
// output parser: an extra key fails the call instead of reaching the browser.

import type {
  Capability,
  ConnectionBinding,
  ProviderId,
  ResolvedConnectionView,
  RoutableTask,
  Task,
  UnavailableCause,
  UserConnection,
} from "@orb/contracts/inference";
import {
  capabilitySchema,
  connectionBindingSchema,
  providerIdSchema,
  resolvedConnectionViewSchema,
  routableTaskSchema,
  taskSchema,
  unavailableCauseSchema,
  userConnectionSchema,
} from "@orb/contracts/inference";
import type { ResolvedWarning } from "@orb/inference";
import { resolvedWarningSchema } from "@orb/inference";
import { z } from "zod";

/** A connection row with what the pane renders beside it: the tasks it may serve and the provider's label. */
export interface ConnectionView extends UserConnection {
  readonly providerLabel: string;
  /** `connectionTasks(provider, kind)` — the Model-roles slots this row may be bound to. */
  readonly tasks: readonly Task[];
}

export const connectionViewSchema = userConnectionSchema
  .extend({ providerLabel: z.string(), tasks: z.array(taskSchema).readonly() })
  .strict() satisfies z.ZodType<ConnectionView>;

/** The capability read for one row (`runtime.capabilities.for`): the descriptor + the warnings it was
 *  synthesized with + the tasks. */
export interface ConnectionCapabilityView {
  readonly capability: Capability;
  /** The same evidence fold with this row's declaration omitted. */
  readonly baseline: Capability;
  readonly warnings: readonly ResolvedWarning[];
  readonly tasks: readonly Task[];
  /** The built-in row this row's server was detected as (`features.detectServer`); absent when it reads as itself. */
  readonly detectedProviderId?: ProviderId | undefined;
}

export const connectionCapabilityViewSchema = z.strictObject({
  capability: capabilitySchema,
  baseline: capabilitySchema,
  warnings: z.array(resolvedWarningSchema).readonly(),
  tasks: z.array(taskSchema).readonly(),
  detectedProviderId: providerIdSchema.optional(),
}) satisfies z.ZodType<ConnectionCapabilityView>;

/** One Model-roles row: the actor's binding for a task AND what a turn resolves to RIGHT NOW against the
 *  PERSISTED read (§5.3a: "Not applied yet — still running on …" is the readout this pair enables). */
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

export const bindingViewSchema = z.strictObject({
  task: routableTaskSchema,
  binding: connectionBindingSchema.strict().nullable(),
  resolved: resolvedConnectionViewSchema.nullable(),
  unavailableCause: unavailableCauseSchema.nullable(),
}) satisfies z.ZodType<BindingView>;

export interface CatalogRefreshOutcome {
  readonly models: number | null;
}

export const catalogRefreshOutcomeSchema = z.strictObject({ models: z.number().int().nonnegative().nullable() }) satisfies z.ZodType<CatalogRefreshOutcome>;

export interface EmbedSpace {
  readonly fingerprint: string;
  readonly model: string;
  readonly dim: number;
}

/** The embed-space trigger's CONDITION: concrete encoder identity and served output width, with
 *  `null` where nothing resolves (unbound / unservable / unfundable — a task with no vectors to strand).
 *  PARTIAL by construction: `substrate/embed-space.ts` fills exactly the VECTOR tasks, so a lookup for any
 *  other routable task is `undefined` rather than a lie about a space it never resolved. */
export type EmbedSpaces = Readonly<Partial<Record<RoutableTask, EmbedSpace | null>>>;

export type { CredentialHealth } from "@orb/contracts/credentials";
export type { ProviderAvailability } from "@orb/contracts/inference";

/** What one local-light seed wrote: the connection rows it inserted and the tasks it newly bound. */
export interface LocalLightSeedResult {
  readonly inserted: number;
  readonly boundTasks: readonly RoutableTask[];
}
