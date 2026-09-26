// Package-internal runtime and composition shapes. `src/contract/` is @orb/inference's one type home;
// implementation modules import these downward and the package root re-exports only the public subset.

import type { ResolvedSecret } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { BindingActorKind, ConnectionBinding, ProviderDef, ProviderId, RoutableTask, UserConnection } from "@orb/contracts/inference";
import type { StructuredOutputVehicle } from "@orb/contracts/role-clients";
import type { AutomationRuleId, PluginId, UserCredentialId, UserId } from "@orb/kit/ids";
import { z } from "zod";
import type { SessionEntryWriter } from "./agent.ts";
import type { WireCaptureSink } from "./backend.ts";
import type { ProviderErrorKind } from "./errors.ts";
import type { Resolved } from "./resolved.ts";
import type { RoleClientsWithSignal } from "./roles.ts";

export interface SpanAttrs {
  readonly [key: string]: string | number | boolean | undefined;
}

export type SpanFn = <T>(name: string, fn: () => Promise<T> | T, attrs?: SpanAttrs) => Promise<T>;

type SuperviseDetached = (name: string, attrs: SpanAttrs, operation: () => Promise<unknown> | unknown) => void;

export type AddSpanEvent = (name: string, attrs: Readonly<Record<string, string | number | boolean>>) => void;

export const ANTH_IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type AnthImageMediaType = (typeof ANTH_IMAGE_MEDIA_TYPES)[number];
export type AnthImageBlock =
  | { readonly type: "image"; readonly source: { readonly type: "base64"; readonly media_type: AnthImageMediaType; readonly data: string } }
  | { readonly type: "image"; readonly source: { readonly type: "url"; readonly url: string } };

export type BindingActor =
  | { readonly kind: "automation-rule"; readonly ruleId: AutomationRuleId }
  | { readonly kind: "plugin-grant"; readonly pluginId: PluginId };

export type ProviderOrigin = { readonly plugin: PluginId; readonly pluginName: string } | { readonly admin: UserId };

export type SpawnIdentity = Pick<Resolved, "ownerId" | "credential">;

export const LOCAL_LIGHT_MODEL_SLOTS = ["rerank", "embed", "matte"] as const;
export type LocalLightModelSlot = (typeof LOCAL_LIGHT_MODEL_SLOTS)[number];

const MODEL_FAMILIES = ["anthropic", "openai", "google", "meta", "deepseek", "qwen", "mistral", "xai", "other"] as const;
export type ModelFamily = (typeof MODEL_FAMILIES)[number];

const REACHABILITY_STATES = ["up", "down", "asleep", "unknown"] as const;
export type Reachability = (typeof REACHABILITY_STATES)[number];
export type ReachabilityProbe = (args: {
  readonly baseUrl: string;
  readonly secret: string | null;
  readonly headers: Readonly<Record<string, string>> | undefined;
  readonly sleepPath: string | undefined;
}) => Promise<Reachability>;

const endpointModelSchema = z.object({ id: z.string(), contextLength: z.number().nullable() });
export type EndpointModel = z.infer<typeof endpointModelSchema>;
export const endpointModelsSchema = z.array(endpointModelSchema) satisfies z.ZodType<EndpointModel[]>;

export type RoleClientsFor = (funder: Principal, actor?: BindingActor) => RoleClientsWithSignal;

/** One catalog mirror warm: the value it now holds, or why the live fetch failed, already scrubbed of the
 *  secrets that warm dialed with. Every caller coalesced onto one warm shares this one answer, so the reason is
 *  scrubbed where the secret is known, never by a later reader. The resolve path degrades on `ok: false`; the
 *  model-list read reports the reason as its `listed: false` reason. */
export type MirrorWarm<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

/** The secret a model-list read dials with: the CALLER's saved credential by id (re-read through the credentials
 *  domain, never hand-minted), or a raw key typed into a draft that has not been saved yet. */
type CatalogSecret = { readonly credentialId: UserCredentialId | null } | { readonly key: string };

/** A model-list read for a connection that may not exist yet. A saved row reads through the same shape, so
 *  there is one catalog read. `baseUrl` is an `auth: endpoint` row's own server; a hosted provider's fixed URL
 *  wins over it. */
export interface CatalogDraft {
  readonly principal: Principal;
  readonly providerId: ProviderId;
  readonly secret: CatalogSecret;
  readonly baseUrl: string | null;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export interface InferenceLog {
  readonly debug: (fields: Readonly<Record<string, unknown>>, message: string) => void;
  readonly info: (fields: Readonly<Record<string, unknown>>, message: string) => void;
  readonly warn: (fields: Readonly<Record<string, unknown>>, message: string) => void;
  readonly error: (fields: Readonly<Record<string, unknown>>, message: string) => void;
}

export interface SnapshotStore {
  readonly read: (key: string) => Promise<string | null>;
  readonly write: (key: string, value: string) => Promise<void>;
}

export interface ConnectionStore {
  readonly get: (id: UserConnection["id"]) => Promise<UserConnection | null>;
  readonly listForOwner: (ownerId: UserId) => Promise<readonly UserConnection[]>;
}

export interface BindingStore {
  readonly lookup: (args: { readonly actorKind: BindingActorKind; readonly actorId: string; readonly task: RoutableTask }) => Promise<ConnectionBinding | null>;
}

/** The store's read: the deployment-wide admin rows, and one entry per claim an enabled install serves,
 *  carrying that owner's own definition of the `plugin:` id (D147, D265 — it serves only that owner). */
export interface ProviderSnapshot {
  readonly rows: readonly ProviderDef[];
  readonly installs: readonly { readonly ownerId: UserId; readonly row: ProviderDef }[];
}

export interface ProviderStore {
  readonly list: () => Promise<ProviderSnapshot>;
  readonly putAdmin: (row: ProviderDef, admin: UserId) => Promise<void>;
  readonly removeAdmin: (id: ProviderId) => Promise<boolean>;
  readonly replacePlugin: (
    rows: readonly ProviderDef[],
    pluginId: PluginId,
  ) => Promise<{ readonly ok: true } | { readonly ok: false; readonly conflictingId: ProviderId }>;
  readonly removePlugin: (pluginId: PluginId) => Promise<void>;
}

export interface InferenceDeps {
  readonly now: () => number;
  readonly log: InferenceLog;
  readonly span: SpanFn;
  readonly superviseDetached: SuperviseDetached;
  readonly addSpanEvent?: ((name: string, attrs?: SpanAttrs) => void) | undefined;
  readonly securityEvent?: ((kind: string, fields: Readonly<Record<string, unknown>>) => void) | undefined;
  readonly env: {
    readonly claudeExecutable?: string | undefined;
    readonly hostEnvAllowlist: () => Readonly<Record<string, string>>;
  };
  readonly app: { readonly name: string; readonly url: string };
  readonly snapshotStore: SnapshotStore;
  readonly resolveCredential: (args: {
    readonly credentialId: UserCredentialId | null;
    readonly ownerId: UserId;
    readonly providerId: ProviderId;
  }) => Promise<ResolvedSecret>;
  readonly onAuthFailed?:
    | ((args: {
        readonly ownerId: UserId;
        readonly credentialId: UserCredentialId | null;
        readonly errorKind: ProviderErrorKind;
        readonly errorMessage: string;
      }) => Promise<void>)
    | undefined;
  readonly structuredOutputVehicle: () => StructuredOutputVehicle;
  readonly connections: ConnectionStore;
  readonly bindings: BindingStore;
  readonly providerStore: ProviderStore;
  readonly captureWire?: WireCaptureSink | undefined;
  readonly captureWireReply?: boolean | undefined;
  readonly imageToPng?: ((bytes: Uint8Array) => Promise<Uint8Array>) | undefined;
  readonly agentSdk: {
    readonly summarizeConcurrency: () => number;
    readonly query?: unknown;
    readonly sessionStore?: unknown;
    readonly sessionWriter?: SessionEntryWriter | undefined;
  };
  readonly userRuntimeDir: (ownerId: UserId, tool: "claude") => string;
  readonly embedSpace: { readonly dims: number };
  readonly localLight?:
    | {
        readonly cacheDir?: string | undefined;
        readonly embedDtype?: string | undefined;
        readonly device?: string | undefined;
        readonly allowRemoteModels?: boolean | undefined;
        readonly cache?: unknown;
      }
    | undefined;
  readonly sdkFetch: typeof fetch;
  readonly random?: (() => number) | undefined;
}
