// tests/inference/_support — the pure value factories every `@orb/inference` test threads: a fake
// `InferenceDeps` over in-memory stores (connections · bindings · provider rows · snapshots), a connection
// row, a resolved secret, a frozen clock. NO db, NO server graph: the runtime's ports are exactly what a
// test hands in, which is the whole point of the deps interface (§11).

import type { ResolvedSecret, ResolvedSecretKind } from "@orb/contracts/credentials";
import type {
  Capability,
  ConnectionBinding,
  EndpointFeatures,
  PromptCacheSettings,
  ProviderDef,
  RoutableTask,
  Task,
  UserConnection,
} from "@orb/contracts/inference";
import { builtinProvider, foldFeatures, modelIdSchema, providerIdSchema, requirementMet, SHIPPED_PROMPT_CACHE, taskDef } from "@orb/contracts/inference";
import type { AutomationRuleId, ModelId, PluginId, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import type { ConnectionTransport, Resolved } from "../../packages/inference/src/contract/resolved.ts";
import type {
  BindingStore,
  ConnectionStore,
  InferenceDeps,
  InferenceLog,
  ProviderSnapshot,
  ProviderStore,
  SnapshotStore,
} from "../../packages/inference/src/deps.ts";

const FROZEN_NOW = 1_700_000_000_000;

/** The brand's ONLY producer is the credentials domain's resolve factory; a test mints one through the same
 *  cast the chat scenario support uses for `ResolvedCredential` (the seam is the point of the brand). */
function fakeSecret(kind: ResolvedSecretKind, secret: string | null, credentialId: UserCredentialId | null = null): ResolvedSecret {
  // @orb-waive no-test-fabrication(unknown): the `ResolvedSecret` brand's only producer is the credentials domain's resolve factory; a runtime test mints one through the same cast the chat scenario support uses for `ResolvedCredential`. Ends when the credentials domain exports a test factory for the brand.
  return { kind, secret, credentialId } as unknown as ResolvedSecret;
}

/** An `apiKey` secret for a hosted-wire turn test — the SDK providers refuse to build a request without one,
 *  so a fake-fetch turn still needs a credential the transport can spell into its auth header. */
export function fakeApiKeySecret(secret: string): ResolvedSecret {
  return fakeSecret("apiKey", secret);
}

function silentLog(): InferenceLog & { readonly lines: { level: string; message: string; fields: Record<string, unknown> }[] } {
  const lines: { level: string; message: string; fields: Record<string, unknown> }[] = [];
  const push =
    (level: string): InferenceLog["info"] =>
    (fields, message): void => {
      lines.push({ level, message, fields: { ...fields } });
    };
  return { lines, debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") };
}

type ConnectionOverrides = Omit<Partial<UserConnection>, "ownerId" | "providerId" | "model"> & {
  readonly ownerId: UserId;
  readonly providerId: string;
  readonly model: string;
};

export function fakeConnection(overrides: ConnectionOverrides): UserConnection {
  return {
    id: mintTypeId(ID_PREFIX.userConnection),
    label: `${overrides.providerId} · ${overrides.model}`,
    credentialId: null,
    baseUrl: null,
    api: "auto",
    declared: null,
    extras: null,
    transport: null,
    modelCheck: "listed",
    allowBackground: false,
    promptCache: null,
    createdAt: FROZEN_NOW,
    updatedAt: FROZEN_NOW,
    ...overrides,
    model: modelIdSchema.parse(overrides.model),
    providerId: providerIdSchema.parse(overrides.providerId),
  };
}

export interface MemoryStores {
  readonly connections: ConnectionStore & { readonly rows: Map<UserConnectionId, UserConnection> };
  readonly bindings: BindingStore & {
    readonly bind: (args: { actorKind: ConnectionBinding["actorKind"]; actorId: string; task: RoutableTask; connectionId: UserConnectionId | null }) => void;
  };
  readonly providerStore: ProviderStore & { readonly state: MemoryProviderState };
  readonly snapshotStore: SnapshotStore & { readonly entries: Map<string, string> };
}

/** One owner's claim on a `plugin:` id: that owner's definition, and the install serving it (`null` = tombstone). */
interface MemoryClaim {
  readonly ownerId: UserId;
  readonly row: ProviderDef;
  pluginId: PluginId | null;
}

/** The in-memory twin of the provider tables: admin rows by id and per-owner claims keyed by
 *  {@link memoryClaimKey}. `pluginOwners` stands in for `plugins.owner_id`, which every claim writer reads. */
export interface MemoryProviderState {
  readonly admins: Map<string, ProviderDef>;
  readonly claims: Map<string, MemoryClaim>;
  readonly pluginOwners: Map<PluginId, UserId>;
}

export function memoryClaimKey(ownerId: UserId, providerId: string): string {
  return `${ownerId}|${providerId}`;
}

export function memoryProviderState(pluginOwners: ReadonlyMap<PluginId, UserId> = new Map<PluginId, UserId>()): MemoryProviderState {
  return { admins: new Map(), claims: new Map(), pluginOwners: new Map(pluginOwners) };
}

/** The in-memory twin of `listProviderRows`: admin rows, and each served claim with its owner's own definition. */
export function memoryProviderSnapshot(state: MemoryProviderState): ProviderSnapshot {
  const installs = [...state.claims.values()].filter((claim) => claim.pluginId !== null).map(({ ownerId, row }) => ({ ownerId, row }));
  return { rows: [...state.admins.values()], installs };
}

/** The in-memory twin of `releasePluginProviderClaims`: the install's claims become tombstones. */
export function memoryReleasePlugin(state: MemoryProviderState, pluginId: PluginId): void {
  for (const claim of state.claims.values()) {
    if (claim.pluginId === pluginId) {
      claim.pluginId = null;
    }
  }
}

/** The in-memory twin of `replacePluginProviderRows`: a claim is permanent per owner, independent across owners. */
export function memoryReplacePlugin(
  state: MemoryProviderState,
  desired: readonly ProviderDef[],
  pluginId: PluginId,
): { readonly ok: true } | { readonly ok: false; readonly conflictingId: ProviderDef["id"] } {
  const ownerId = state.pluginOwners.get(pluginId);
  if (ownerId === undefined) {
    throw new Error(`tests/inference: plugin ${pluginId} has no owner to claim for`);
  }
  const conflict = desired.find((row) => {
    const claim = state.claims.get(memoryClaimKey(ownerId, row.id));
    return claim !== undefined && JSON.stringify(claim.row) !== JSON.stringify(row);
  });
  if (conflict !== undefined) {
    return { ok: false, conflictingId: conflict.id };
  }
  memoryReleasePlugin(state, pluginId);
  for (const row of desired) {
    const key = memoryClaimKey(ownerId, row.id);
    const claim = state.claims.get(key) ?? { ownerId, row, pluginId: null };
    claim.pluginId = pluginId;
    state.claims.set(key, claim);
  }
  return { ok: true };
}

export function memoryStores(): MemoryStores {
  const rows = new Map<UserConnectionId, UserConnection>();
  const bindingRows = new Map<string, ConnectionBinding>();
  const providerState = memoryProviderState();
  const entries = new Map<string, string>();
  const key = (actorKind: string, actorId: string, task: string): string => `${actorKind}|${actorId}|${task}`;
  return {
    connections: {
      rows,
      get: (id) => Promise.resolve(rows.get(id) ?? null),
      listForOwner: (ownerId) => Promise.resolve([...rows.values()].filter((row) => row.ownerId === ownerId)),
    },
    bindings: {
      lookup: (args) => Promise.resolve(bindingRows.get(key(args.actorKind, args.actorId, args.task)) ?? null),
      bind: (args): void => {
        bindingRows.set(key(args.actorKind, args.actorId, args.task), {
          id: mintTypeId(ID_PREFIX.connectionBinding),
          actorKind: args.actorKind,
          userId: args.actorKind === "user" ? castId<UserId>(args.actorId) : null,
          ruleId: args.actorKind === "automation-rule" ? castId<AutomationRuleId>(args.actorId) : null,
          pluginId: args.actorKind === "plugin-grant" ? castId<PluginId>(args.actorId) : null,
          task: args.task,
          connectionId: args.connectionId,
        });
      },
    },
    providerStore: {
      state: providerState,
      list: () => Promise.resolve(memoryProviderSnapshot(providerState)),
      putAdmin: (row): Promise<void> => {
        providerState.admins.set(row.id, row);
        return Promise.resolve();
      },
      removeAdmin: (id): Promise<boolean> => Promise.resolve(providerState.admins.delete(id)),
      replacePlugin: (desired, pluginId) => Promise.resolve(memoryReplacePlugin(providerState, desired, pluginId)),
      removePlugin: (pluginId): Promise<void> => {
        memoryReleasePlugin(providerState, pluginId);
        return Promise.resolve();
      },
    },
    snapshotStore: {
      entries,
      read: (k) => Promise.resolve(entries.get(k) ?? null),
      write: (k, v): Promise<void> => {
        entries.set(k, v);
        return Promise.resolve();
      },
    },
  };
}

export interface FakeDepsOptions {
  readonly stores?: MemoryStores | undefined;
  readonly claudeExecutable?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly secrets?: ReadonlyMap<string, ResolvedSecret> | undefined;
  readonly log?: InferenceLog | undefined;
  readonly securityEvents?: { kind: string; fields: Record<string, unknown> }[] | undefined;
  /** The send-boundary sink (`InferenceDeps.captureWire`) — the ONE observation point that exists on EVERY
   *  wire, including agent-sdk (whose `body` is the SDK query input, since that wire has no HTTP body). A
   *  cross-backend "this knob was never sent" pin reads it rather than a per-wire request recorder. */
  readonly captureWire?: InferenceDeps["captureWire"];
  /** The agent-sdk `query` seam (`InferenceDeps.agentSdk.query`, typed `unknown` there on purpose): a
   *  function returning an async iterable of SDK-shaped frames. The ONLY way to drive that wire without the
   *  bundled `claude` subprocess. */
  readonly agentSdkQuery?: unknown;
}

const NO_NETWORK: typeof fetch = () => Promise.reject(new Error("tests/inference: unexpected network call"));

/** An `InferenceDeps` whose every port is in-memory. `secrets` maps `credentialId` → the resolved secret; a
 *  `null` credential id resolves to the `none` kind like the domain does. */
export function fakeDeps(options: FakeDepsOptions = {}): InferenceDeps & { readonly stores: MemoryStores } {
  const stores = options.stores ?? memoryStores();
  const log = options.log ?? silentLog();
  return {
    stores,
    now: () => FROZEN_NOW,
    log,
    span: (_name, fn) => Promise.resolve(fn()),
    superviseDetached: (_name, _attrs, operation): void => {
      Promise.resolve()
        .then(operation)
        .catch(() => undefined);
    },
    securityEvent: (kind, fields): void => {
      options.securityEvents?.push({ kind, fields: { ...fields } });
    },
    env: { claudeExecutable: options.claudeExecutable, hostEnvAllowlist: () => ({ PATH: "/usr/bin", HOME: "/home/test" }) },
    app: { name: "orbweaver-test", url: "http://localhost:0" },
    snapshotStore: stores.snapshotStore,
    resolveCredential: ({ credentialId }): Promise<ResolvedSecret> => {
      if (credentialId === null) {
        return Promise.resolve(fakeSecret("none", null));
      }
      const found = options.secrets?.get(credentialId);
      return found === undefined ? Promise.reject(new Error(`tests/inference: no secret for ${credentialId}`)) : Promise.resolve(found);
    },
    structuredOutputVehicle: () => "auto",
    connections: stores.connections,
    bindings: stores.bindings,
    providerStore: stores.providerStore,
    agentSdk: { summarizeConcurrency: () => 2, ...(options.agentSdkQuery !== undefined ? { query: options.agentSdkQuery } : {}) },
    ...(options.captureWire !== undefined ? { captureWire: options.captureWire } : {}),
    userRuntimeDir: (ownerId, tool) => `/tmp/orb-test/${ownerId}/${tool}`,
    embedSpace: { dims: 1024 },
    localLight: { cache: fakeModelCache() },
    sdkFetch: options.fetch ?? NO_NETWORK,
  };
}

export function newUserId(): UserId {
  return newId<UserId>();
}

export function newPluginId(): PluginId {
  return mintTypeId(ID_PREFIX.plugin);
}

export function newRuleId(): AutomationRuleId {
  return mintTypeId(ID_PREFIX.automationRule);
}

/** A local-light model cache whose vectors are deterministic functions of the input — the backend's test
 *  seam (`deps.localLight.cache`), so no ONNX runtime loads. Records every call for the tasks' pins.
 *  `failedModels` are the repo ids whose latest load reads as failed. */
export function fakeModelCache(
  dims = 1024,
  failedModels: ReadonlySet<string> = new Set(),
): {
  readonly embedTexts: (repo: string, texts: readonly string[]) => Promise<Float32Array[]>;
  readonly scorePairs: (repo: string, query: string, documents: readonly string[]) => Promise<number[]>;
  readonly embedImages: (repo: string, images: readonly (string | Uint8Array)[]) => Promise<Float32Array[]>;
  readonly embedClipTexts: (repo: string, texts: readonly string[]) => Promise<Float32Array[]>;
  readonly removeBackground: (repo: string, image: string | Uint8Array) => Promise<Uint8Array>;
  readonly preload: (slot: string, repo: string) => Promise<void>;
  readonly loadFailed: (repo: string) => boolean;
  readonly calls: { method: string; repo: string; count: number }[];
} {
  const calls: { method: string; repo: string; count: number }[] = [];
  const vectorFor = (seed: number): Float32Array => {
    const out = new Float32Array(dims);
    for (let i = 0; i < dims; i += 1) {
      out[i] = ((seed + 1) * (i + 1)) % 7;
    }
    return out;
  };
  const note = (method: string, repo: string, count: number): void => {
    calls.push({ method, repo, count });
  };
  return {
    calls,
    embedTexts: (repo, texts): Promise<Float32Array[]> => {
      note("embedTexts", repo, texts.length);
      return Promise.resolve(texts.map((text) => vectorFor(text.length)));
    },
    scorePairs: (repo, _query, documents): Promise<number[]> => {
      note("scorePairs", repo, documents.length);
      return Promise.resolve(documents.map((doc) => doc.length));
    },
    embedImages: (repo, images): Promise<Float32Array[]> => {
      note("embedImages", repo, images.length);
      return Promise.resolve(images.map((_image, i) => vectorFor(i)));
    },
    embedClipTexts: (repo, texts): Promise<Float32Array[]> => {
      note("embedClipTexts", repo, texts.length);
      return Promise.resolve(texts.map((text) => vectorFor(text.length)));
    },
    removeBackground: (modelId): Promise<Uint8Array> => {
      note("removeBackground", modelId, 1);
      return Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    },
    preload: (slot, repo): Promise<void> => {
      note(`preload:${slot}`, repo, 1);
      return Promise.resolve();
    },
    loadFailed: (repo): boolean => failedModels.has(repo),
  };
}

/** A `Resolved<T>` for a built-in provider row with the kind floor as its capability — what a backend test
 *  hands a task runner directly (the resolver's own fold is pinned in `index.test.ts`). */
export function fakeResolved<T extends Task>(args: {
  readonly task: T;
  readonly providerId: string;
  readonly model: string;
  readonly capability: Capability;
  readonly ownerId?: UserId | undefined;
  readonly secret?: ResolvedSecret | undefined;
  readonly extras?: Readonly<Record<string, JsonValue>> | null | undefined;
  readonly transport?: ConnectionTransport | null | undefined;
  readonly declaredFeatures?: EndpointFeatures | undefined;
  readonly baseUrl?: string | null | undefined;
  readonly allowBackground?: boolean | undefined;
  /** The connection's prompt-cache settings; defaults to the shipped behavior (a row that stored none). */
  readonly promptCache?: PromptCacheSettings | undefined;
  /** The id the model facts come from; defaults to `model` (an OpenRouter alias is the case that differs). */
  readonly factsModel?: string | undefined;
}): Resolved<T> {
  const provider = builtinProvider(args.providerId);
  if (provider === undefined) {
    throw new Error(`tests/inference: no built-in provider ${args.providerId}`);
  }
  return {
    task: args.task,
    ownerId: args.ownerId ?? newUserId(),
    connectionId: mintTypeId(ID_PREFIX.userConnection),
    providerId: provider.id,
    wire: provider.wire,
    api: provider.apis[0] ?? null,
    model: castId<ModelId>(args.model),
    capability: args.capability,
    requirement: requirementMet(args.capability, taskDef(args.task).requires),
    provider,
    credential: args.secret ?? fakeSecret("none", null),
    baseUrl: args.baseUrl ?? provider.baseUrl ?? null,
    features: foldFeatures(provider.features, args.declaredFeatures),
    extras: args.extras ?? null,
    transport: args.transport ?? null,
    allowBackground: args.allowBackground ?? false,
    promptCache: args.promptCache ?? SHIPPED_PROMPT_CACHE,
    factsModel: castId<ModelId>(args.factsModel ?? args.model),
  };
}
