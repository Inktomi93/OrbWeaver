import type { Principal } from "@orb/contracts/identity";
import type {
  CachePolicyContext,
  Capability,
  EmbeddingCapability,
  GenerationCapability,
  ModelCatalogEntry,
  ModelKind,
  ModelListing,
  ProviderAvailability,
  ProviderDef,
  SendAvailability,
  Task,
  TokenizeResult,
  UserConnection,
} from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { UserId } from "@orb/kit/ids";
import type { ProviderExecutor } from "./backend.ts";
import type { SynthesizedCapability } from "./capability.ts";
import type { ProviderDiagnostics } from "./diagnostics.ts";
import type { EmbedOptions } from "./funnel.ts";
import type { LocalLightBackend } from "./local-light.ts";
import type { ProviderRegistry } from "./registry.ts";
import type { ResolvedChatKnobs, ResolvedEmbedKnobs } from "./resolve.ts";
import type { CatalogDraft, ProviderOrigin, RoleClientsFor } from "./runtime.ts";
import type { ResolveArgs, ResolveOutcome } from "./task-resolution.ts";

export interface CapabilityRead extends SynthesizedCapability {
  readonly cacheContext: CachePolicyContext;
  /** The same evidence fold with this row's declaration omitted. */
  readonly baseline: Capability;
  /** The tasks this row may serve (`connectionTasks`), so the pane's requirement badges and the Model-roles
   *  slots read one object. */
  readonly tasks: readonly Task[];
  /** The built-in row a detecting row's server identified as (`features.detectServer`); absent when the row
   *  reads as itself. The editor names it and lists that row's quirks. */
  readonly detectedProviderId?: ProviderDef["id"] | undefined;
}

export interface InferenceRuntime {
  readonly resolve: (args: ResolveArgs) => Promise<ResolveOutcome>;
  readonly availability: (args: ResolveArgs) => Promise<SendAvailability>;
  /** The availability verdict's no-I/O half for a row that already resolved: a local-light model whose latest
   *  load failed reads `model-load-failed`. The Connections readout asks it without probing endpoints. */
  readonly loadVerdict: (resolved: ResolveOutcome["resolved"]) => SendAvailability;
  /** The kind a saved row's model is, as the resolver reads it: the row's declaration, its server's or catalog's
   *  stated kind (warmed first), the curated rows, else `generation`. `cachedFacts` reads only the facts already held,
   *  in memory or persisted, and dials nothing, for a read that lists rows or previews a change. `coldAs` is the kind
   *  such a read answers while a warm could still change it (anything short of the row's own declaration): a preview
   *  that must err toward the change that asks the user first. */
  readonly modelKind: (
    connection: UserConnection,
    options?: { readonly cachedFacts?: boolean | undefined; readonly coldAs?: ModelKind | undefined },
  ) => Promise<ModelKind>;
  /** Tasks whose actual capability requirements this model meets; cached reads never open credentials or dial. */
  readonly modelTasks: (connection: UserConnection, options?: Parameters<InferenceRuntime["modelKind"]>[1]) => Promise<readonly Task[]>;
  readonly executor: ProviderExecutor;
  readonly capabilities: {
    /** provider row + declared overrides + catalog row → one descriptor, for a connection the principal owns
     *  (the credential is resolved so an endpoint's own `/v1/models` window can be read). */
    readonly for: (args: { readonly connectionId: UserConnection["id"]; readonly principal: Principal }) => Promise<CapabilityRead>;
  };
  readonly funnel: {
    readonly chat: (intent: UserIntent, capability: GenerationCapability) => ResolvedChatKnobs;
    readonly embed: (opts: EmbedOptions, capability: EmbeddingCapability) => ResolvedEmbedKnobs;
  };
  readonly roleClientsFor: RoleClientsFor;
  readonly catalogs: {
    /** What a provider can list, for a connection being authored or a saved row read through the same draft
     *  (`catalog/listing.ts` owns the strategy arms). A failed or empty list is `listed: false` with its reason —
     *  the pane's typed-id fallback (§7.4); a credential the caller does not hold is a thrown refusal. */
    readonly models: (draft: CatalogDraft) => Promise<ModelListing>;
    /** A `builtin` provider's closed model set (the curated rows), or `null` for a `url` provider, whose list
     *  can lag the provider and so admits a typed id. The write seam refuses an id outside a closed set. */
    readonly builtin: (providerId: string, viewer: UserId) => readonly ModelCatalogEntry[] | null;
    /** Force a live re-fetch of a provider's mirror (the OpenRouter enrichment; the daemon catalog needs a
     *  connection and refreshes on its next `models` read after `invalidate`). Returns the mirror's entry
     *  count when one was warmed, `null` when the strategy has no process-wide mirror. An operator path with
     *  no principal, so it reaches deployment-wide rows only — never a plugin row. */
    readonly refresh: (providerId: string) => Promise<{ readonly models: number | null }>;
    /** Forget what one connection's server last advertised, in memory and in the persisted snapshot, so its
     *  next resolve dials the server again — the hook a save or an endpoint inspection runs, because a server
     *  restarted without its projector or `--jinja` keeps its earlier facts until something asks again. */
    readonly invalidateEndpoint: (connection: UserConnection) => Promise<void>;
    /** What each word tokenizes to on a resolved connection's server, through the same cache a turn reads (the
     *  logit-bias editor's live display). A row with no tokenize endpoint answers `available: false`, no words. */
    readonly tokenize: (resolved: ResolveOutcome["resolved"], words: readonly string[]) => Promise<TokenizeResult>;
  };
  readonly diagnostics: ProviderDiagnostics;
  readonly providers: {
    readonly registry: ProviderRegistry;
    /** What the picker may offer `principal` — every row it may use with its wire's build state (§5.3a:
     *  `claude-sub` renders disabled with `runtime-missing`). A row on an unbuilt wire is LISTED, never hidden;
     *  a plugin row none of the principal's enabled installs contributes is absent (D147). */
    readonly available: (principal: Principal) => readonly ProviderAvailability[];
    readonly register: (row: unknown, origin: ProviderOrigin) => Promise<ProviderDef>;
    readonly drop: (id: ProviderDef["id"]) => Promise<void>;
    readonly registerPlugin: ProviderRegistry["registerPlugin"];
    readonly dropPlugin: ProviderRegistry["dropPlugin"];
  };
  /** The in-process tier's handles for the composition root: the boot prefetch (`start` with the slots that
   *  ACTUALLY resolved, §8.3), the active embed-space tag, and the
   *  bounded close of its inference worker that shutdown runs. */
  readonly localLight: Pick<LocalLightBackend, "prefetch" | "embedSpace" | "close" | "settle">;
  readonly agentSdk: import("./agent-sdk-execution.ts").AgentSdkLifetime;
}
