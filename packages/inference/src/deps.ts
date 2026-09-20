// `InferenceDeps` — everything the runtime needs from the world, injected once by the composition root
// (§11). No `#foundation`, no `@orb/db`: observability is a structural port, persistence is FOUR ports the
// server wires to drizzle (connections · bindings · provider rows · catalog snapshots), the child-env
// allowlist is a getter, the provider TRANSPORT is a required handed-in `fetch` (the SSRF belt is the
// server-side global dispatcher over it, not this field). No posture, no engine launch, no repo root,
// no host-claude detection — the owner-engine premise left with the fleet code.

import type { ResolvedSecret } from "@orb/contracts/credentials";
import type { BindingActorKind, ConnectionBinding, ProviderDef, ProviderId, RoutableTask, UserConnection } from "@orb/contracts/inference";
import type { StructuredOutputVehicle } from "@orb/contracts/role-clients";
import type { AutomationRuleId, PluginId, UserCredentialId, UserId } from "@orb/kit/ids";
import type { WireCaptureSink } from "./contract/backend.ts";
import type { ProviderErrorKind } from "./contract/errors.ts";

export interface SpanAttrs {
  readonly [key: string]: string | number | boolean | undefined;
}

/** The structural shape of the server's `span()` — the package never imports the tracer. */
export type SpanFn = <T>(name: string, fn: () => Promise<T> | T, attrs?: SpanAttrs) => Promise<T>;

export interface InferenceLog {
  readonly debug: (fields: Readonly<Record<string, unknown>>, message: string) => void;
  readonly info: (fields: Readonly<Record<string, unknown>>, message: string) => void;
  readonly warn: (fields: Readonly<Record<string, unknown>>, message: string) => void;
  readonly error: (fields: Readonly<Record<string, unknown>>, message: string) => void;
}

/** The catalog snapshot KV the server wires to its table: the OpenRouter enrichment, an endpoint's
 *  `/v1/models` list, the daemon catalog — process-wide facts, not per-user. */
export interface SnapshotStore {
  readonly read: (key: string) => Promise<string | null>;
  readonly write: (key: string, value: string) => Promise<void>;
}

/** Read/write `user_connections` — a port; the domain's verbs own the writes and validate against the
 *  registry, the runtime reads. */
export interface ConnectionStore {
  readonly get: (id: UserConnection["id"]) => Promise<UserConnection | null>;
  readonly listForOwner: (ownerId: UserId) => Promise<readonly UserConnection[]>;
}

/** The ONE actor a fold runs in the context of: a rule (its author is the funder) or a plugin grant (the
 *  installing user is the funder). Absent ⇒ the funder's own `user` bindings only. */
export type BindingActor =
  | { readonly kind: "automation-rule"; readonly ruleId: AutomationRuleId }
  | { readonly kind: "plugin-grant"; readonly pluginId: PluginId };

/** Read `connection_bindings` — the §7.1 fold's input: one indexed lookup per hop, no JSON parse. */
export interface BindingStore {
  readonly lookup: (args: { readonly actorKind: BindingActorKind; readonly actorId: string; readonly task: RoutableTask }) => Promise<ConnectionBinding | null>;
}

/** Runtime provider rows (`provider_rows`: plugin-shipped + admin-added), beside the built-ins. */
export interface ProviderStore {
  readonly list: () => Promise<readonly ProviderDef[]>;
  readonly put: (row: ProviderDef, origin: { readonly plugin: PluginId } | { readonly admin: UserId }) => Promise<void>;
  readonly remove: (id: ProviderId) => Promise<void>;
}

export interface InferenceDeps {
  readonly now: () => number;
  readonly log: InferenceLog;
  readonly span: SpanFn;
  readonly addSpanEvent?: ((name: string, attrs?: SpanAttrs) => void) | undefined;
  readonly securityEvent?: ((kind: string, fields: Readonly<Record<string, unknown>>) => void) | undefined;
  readonly env: {
    /** The bundled `claude` executable when it resolves — registration of the agent-sdk wire is exactly this. */
    readonly claudeExecutable?: string | undefined;
    /** The child-env allowlist source (today's `processEnvSnapshot`, narrowed). */
    readonly hostEnvAllowlist: () => Readonly<Record<string, string>>;
  };
  readonly app: { readonly name: string; readonly url: string };
  readonly snapshotStore: SnapshotStore;
  /** By credential id off the connection row — `loadActiveCredential(owner, provider)` is gone. A `null`
   *  id (an `auth: none` row, an open box) returns the domain-minted `kind: "none"` secret; the ownerId is
   *  the tenant scope and the AAD half, so a row that is not the owner's decrypt-fails there. */
  readonly resolveCredential: (args: {
    readonly credentialId: UserCredentialId | null;
    readonly ownerId: UserId;
    readonly providerId: ProviderId;
  }) => Promise<ResolvedSecret>;
  /** The derive-task credential STRIKE-OUT (#1800): the provider's normalized `kind` travels verbatim to the
   *  credentials domain, which alone decides whether it costs the key (only `auth_failed`). Best-effort. */
  readonly onAuthFailed?:
    | ((args: {
        readonly ownerId: UserId;
        readonly credentialId: UserCredentialId | null;
        readonly errorKind: ProviderErrorKind;
        readonly errorMessage: string;
      }) => Promise<void>)
    | undefined;
  /** The deployment's structured-output WIRE VEHICLE, read PER CALL (an admin flip governs the next request). */
  readonly structuredOutputVehicle: () => StructuredOutputVehicle;
  readonly connections: ConnectionStore;
  readonly bindings: BindingStore;
  readonly providerStore: ProviderStore;
  readonly captureWire?: WireCaptureSink | undefined;
  /** Raw PNG transform (MA-6: GIF → first-frame PNG on the hosted wires); absent ⇒ label-only passthrough. */
  readonly imageToPng?: ((bytes: Uint8Array) => Promise<Uint8Array>) | undefined;
  readonly agentSdk: {
    /** The KEPT `agentSdkConcurrency.summarize` getter — the claude-runtime global fan-out cap. */
    readonly summarizeConcurrency: () => number;
    /** The SDK `query` test seam; absent ⇒ the real SDK. */
    readonly query?: unknown;
    /** The D8 in-memory session store; absent ⇒ a fresh process-local one. */
    readonly sessionStore?: unknown;
    /** The `session_entries` write-path injection; absent ⇒ no persistence (the test default). */
    readonly sessionWriter?: unknown;
  };
  /** `<USER_RUNTIME_DIR>/<ownerId>/claude` — the per-user runtime dir every spawn sets `CLAUDE_CONFIG_DIR` to. */
  readonly userRuntimeDir: (ownerId: UserId, tool: "claude") => string;
  /** The deployment's vector width — `search`/`discovery`/`databank` read it here, never an env key. */
  readonly embedSpace: { readonly dims: number };
  /** The in-process ONNX tier's knobs: where the weights live, the encoder's served precision (part of the
   *  vector-space tag, #2417), the device, and whether a missing model may be downloaded. `cache` is the
   *  test seam (a prebuilt fake model cache). */
  readonly localLight?:
    | {
        readonly cacheDir?: string | undefined;
        readonly embedDtype?: string | undefined;
        readonly device?: string | undefined;
        readonly allowRemoteModels?: boolean | undefined;
        readonly cache?: unknown;
      }
    | undefined;
  /** The transport every SDK provider instance and every catalog read issues its request on — REQUIRED, so
   *  there is no ambient fallback to fall through to. The composition root injects the deployment's real
   *  `fetch` (the SSRF belt is the boot-installed global undici dispatcher over it, `infra/network/egress.ts`
   *  — never a property of this reference), and a test injects a fake, which is the whole point: the runtime
   *  resolves this ONCE at construction, so a `vi.spyOn(globalThis, "fetch")` installed later could never
   *  have reached it. */
  readonly sdkFetch: typeof fetch;
  readonly random?: (() => number) | undefined;
}
