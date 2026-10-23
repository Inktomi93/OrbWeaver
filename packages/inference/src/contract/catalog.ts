import type { AgentSdkModel, ModelCatalogEntry, ModelInfoApi } from "@orb/contracts/inference";
import type { ProviderDiagnostics } from "./diagnostics.ts";
import type { ProviderScrubSet } from "./errors.ts";
import type { ProviderRegistry } from "./registry.ts";
import type { InferenceDeps, MirrorWarm, ScheduleTimeout, SnapshotStore, SpanAttrs, SpawnIdentity } from "./runtime.ts";

export interface DetectArgs {
  readonly scheduleTimeout: ScheduleTimeout;
  readonly fetch: typeof fetch;
  readonly baseUrl: string;
  readonly secret: string | null;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface EndpointFetchArgs {
  readonly scheduleTimeout: ScheduleTimeout;
  readonly fetch: typeof fetch;
  readonly baseUrl: string;
  readonly secret: string | null;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly secrets: ProviderScrubSet;
  readonly signal?: AbortSignal | undefined;
  /** The row's folded `features.modelInfoApi`. */
  readonly modelInfoApi?: ModelInfoApi | undefined;
  /** Where a failed native read is reported; it never fails the list. */
  readonly warn?: ((message: string) => void) | undefined;
  /** The ONE listed model the per-model probes may ask about (kind, measured width, prefill). Those probes load or
   *  wake a model, so a plain listing (the add flow, diagnostics) sets none; the resolve warm names the
   *  connection's own model. */
  readonly probeModel?: string | undefined;
}

export interface CatalogListingDeps {
  readonly scheduleTimeout: InferenceDeps["scheduleTimeout"];
  readonly registry: ProviderRegistry;
  readonly resolveCredential: InferenceDeps["resolveCredential"];
  readonly fetch: typeof fetch;
  /** Where a failed native model-info read is reported; it never fails the list. */
  readonly warn: (fields: Readonly<Record<string, unknown>>, message: string) => void;
  readonly warmOpenRouter: () => Promise<MirrorWarm<ModelCatalogEntry[]>>;
  /** The daemon catalog through its mirror, under one user's identity; absent when the wire is not built. */
  readonly warmAgentSdk: ((identity: SpawnIdentity) => Promise<MirrorWarm<AgentSdkModel[]>>) | undefined;
  readonly listModels: ProviderDiagnostics["listModels"];
}

export interface MirrorDeps {
  readonly now: () => number;
  readonly snapshotStore: SnapshotStore;
  readonly addSpanEvent?: ((name: string, attrs?: SpanAttrs) => void) | undefined;
  readonly warn: (fields: Readonly<Record<string, unknown>>, message: string) => void;
}

export interface Mirror<T> {
  readonly get: () => T | null;
  /** Warm when cold: the snapshot first, then `fetch`; persists a fresh fetch. Returns the mirror's value
   *  after the attempt, or why the live fetch failed, scrubbed of `secrets` (the ones `fetch` dials with).
   *  Never a throw: the resolve path degrades on `ok: false`, and the model-list read reports the reason. A
   *  warm that coalesces onto one in flight shares that warm's answer, reason included. */
  readonly warm: (fetch: () => Promise<T>, secrets: ProviderScrubSet) => Promise<MirrorWarm<T>>;
  /** The first half of a warm and nothing more: a cold mirror loads the persisted snapshot, and nothing is dialed. A read
   *  that must not wait on a host still sees what the next warm would read first. `null` when nothing is held. */
  readonly hydrate: () => Promise<T | null>;
  readonly seed: (value: T, at: number) => void;
  /** Rewrite the held value in place, in memory and in the snapshot, keeping its fetch time: facts learned about it
   *  after the fetch (one model's own probes). A cold mirror, or one invalidated meanwhile, keeps nothing. */
  readonly amend: (update: (value: T) => T) => Promise<void>;
  /** Drop the in-memory copy AND skip the snapshot on the next warm — `catalogs.refresh` (a forced live fetch). */
  readonly invalidate: () => void;
}
