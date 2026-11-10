// domain/connection/contract/results — verb result shapes. The row shapes themselves are the cross-boundary
// `UserConnection` / `ConnectionBinding` (`@orb/contracts/inference` — secret-free by construction: a row names
// its credential by id). What this file adds is the pane's DERIVED reads. Each strict schema is its procedure's tRPC
// output parser: an extra key fails the call instead of reaching the browser.

import type { CachePolicy, Capability, ProviderId, ResolvedWarning, RoutableTask, Task } from "@orb/contracts/inference";
import { cachePolicySchema, capabilitySchema, emittedWarningSchema, providerIdSchema, taskSchema } from "@orb/contracts/inference";
import { z } from "zod";

/** The capability read for one row (`runtime.capabilities.for`): the descriptor + the cache plan + the tasks. */
export interface ConnectionCapabilityView {
  readonly cache: CachePolicy;
  readonly cacheWarnings: readonly ResolvedWarning[];
  readonly capability: Capability;
  /** The same evidence fold with this row's declaration omitted. */
  readonly baseline: Capability;
  readonly tasks: readonly Task[];
  /** The built-in row this row's server was detected as (`features.detectServer`); absent when it reads as itself. */
  readonly detectedProviderId?: ProviderId | undefined;
}

export const connectionCapabilityViewSchema = z.strictObject({
  cache: cachePolicySchema,
  cacheWarnings: z.array(emittedWarningSchema).readonly(),
  capability: capabilitySchema,
  baseline: capabilitySchema,
  tasks: z.array(taskSchema).readonly(),
  detectedProviderId: providerIdSchema.optional(),
}) satisfies z.ZodType<ConnectionCapabilityView>;

export type { BindingView } from "@orb/contracts/inference";

export interface CatalogRefreshOutcome {
  readonly models: number | null;
}

export const catalogRefreshOutcomeSchema = z.strictObject({ models: z.int().nonnegative().nullable() }) satisfies z.ZodType<CatalogRefreshOutcome>;

export interface EmbedSpace {
  readonly fingerprint: string;
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
