import type { Principal } from "@orb/contracts/identity";
import type {
  BindingActorKey,
  ConnectionApi,
  ConnectionExtrasDoc,
  ConnectionTransportDoc,
  DeclaredCapability,
  ModelCheck,
  PromptCacheSettings,
  ProviderGenerationId,
  ProviderId,
  ResolveTaskParams as ResolveAuthority,
  ResolveChatCapabilityParams,
  RoutableTask,
} from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import type { ResolveArgs } from "@orb/inference";
import type { AutomationRuleId, ConnectionBindingId, LookupText, PluginId, UserConnectionId, UserCredentialId } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";

export type ResolveTaskParams = ResolveAuthority & Pick<ResolveArgs, "signal">;

// domain/connection/contract/params — every verb's *Params, declared ONCE (§7.4). The acting `principal`
// (resolved at the entry seam) scopes every read and write to its own rows; connection NEVER reads the `users`
// table (no-direct-users-read). The cross-boundary shapes (`UserConnection`, `ConnectionBinding`, `Task`,
// `RoutableTask`, the capability schemas) live in `@orb/contracts/inference`; the verb wrappers live here.

interface ActorParams {
  readonly principal: Principal;
}

/** `tokenizeWords` — the words a logit-bias editor holds, tokenized on the same target `resolveChatCapability` reads. */
export interface TokenizeWordsParams extends ResolveChatCapabilityParams {
  readonly words: readonly string[];
}

export interface ListConnectionsParams extends ActorParams {}

export interface GetConnectionParams extends ActorParams {
  readonly connectionId: UserConnectionId;
}

/** The writable fields of a connection row (everything but id / owner / timestamps). */
export interface ConnectionFields {
  readonly label?: string | undefined;
  readonly providerId: LookupText<ProviderId>;
  readonly credentialId: UserCredentialId | null;
  readonly baseUrl: string | null;
  /** Provider-owned foreign id: open vocabulary, normalized and branded by `modelIdSchema` at the verb. */
  readonly model: string;
  readonly api?: ConnectionApi | undefined;
  readonly declared?: DeclaredCapability | null | undefined;
  readonly extras?: ConnectionExtrasDoc | null | undefined;
  readonly transport?: ConnectionTransportDoc | null | undefined;
  readonly modelCheck?: ModelCheck | undefined;
  readonly allowBackground?: boolean | undefined;
  readonly promptCache?: PromptCacheSettings | null | undefined;
}

export interface CreateConnectionParams extends ActorParams, ConnectionFields {}

/** A FIELD-WISE patch (ground5 M6 — never a GET→whole-blob PUT): only the keys present are written; a JSON
 *  column is replaced as a whole document when its key is present. */
export interface UpdateConnectionParams extends ActorParams {
  readonly connectionId: UserConnectionId;
  readonly patch: { readonly [K in keyof ConnectionFields]?: ConnectionFields[K] | undefined };
}

export interface RemoveConnectionParams extends ActorParams {
  readonly connectionId: UserConnectionId;
}

/** The actor as the STORE spells it: a kind + the id column that kind sets (the persistence-side pair the
 *  runtime's `BindingStore.lookup` uses; the caller-side shape is `BindingActorInput` below). */
export type StoredActor = BindingActorKey;

/** The actor a binding belongs to, from the caller's side: absent ⇒ the caller's own `user` bindings. */
export type BindingActorInput =
  | { readonly kind: "automation-rule"; readonly ruleId: AutomationRuleId }
  | { readonly kind: "plugin-grant"; readonly pluginId: PluginId };

export interface ListBindingsParams extends ActorParams {
  readonly actor?: BindingActorInput | undefined;
}

/** `setBinding` — point ONE routable task at a connection (or clear it with `null`). */
export interface SetBindingParams extends ActorParams {
  readonly task: RoutableTask;
  readonly connectionId: UserConnectionId | null;
  readonly actor?: BindingActorInput | undefined;
}

/** The caller's own pending embedder change, previewed before it is written: re-pointing a role at a row (or
 *  clearing it), patching a row's fields, or using a row for everything it can serve. */
export type EmbedSpaceChange =
  | { readonly kind: "bind"; readonly task: RoutableTask; readonly connectionId: UserConnectionId | null }
  | { readonly kind: "update"; readonly connectionId: UserConnectionId; readonly patch: UpdateConnectionParams["patch"] }
  | { readonly kind: "everywhere"; readonly connectionId: UserConnectionId };

export interface PreviewEmbedSpaceChangeParams extends ActorParams {
  readonly change: EmbedSpaceChange;
}

/** `useForEverything` — write every compatible `user` binding for a row at once (§5.3a, the 90% case). */
export interface UseForEverythingParams extends ActorParams {
  readonly connectionId: UserConnectionId;
}

export interface CatalogModelsParams extends ActorParams {
  readonly connectionId: UserConnectionId;
}

/** `draftCatalogModels` — the add dialog's model list BEFORE the row exists: the provider it is authoring, the
 *  key (a credential it already saved, the caller's, or the raw key still in the form), and an endpoint row's own
 *  server, dialed SERVER-SIDE because a browser cannot reach a user's loopback box. Judged by the same rules as
 *  `create`, so a draft that lists is a draft that saves. A saved key opens under THIS provider id, the one it
 *  was sealed for. */
export interface DraftCatalogModelsParams extends ActorParams {
  readonly providerId: LookupText<ProviderId>;
  readonly credentialId?: UserCredentialId | undefined;
  readonly key?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export interface RefreshCatalogParams {
  readonly providerId: ProviderId;
}

export interface ConnectionDiagnosticParams extends ActorParams {
  readonly connectionId: UserConnectionId;
  readonly signal?: AbortSignal | undefined;
}

export interface GenerationCostParams extends ConnectionDiagnosticParams {
  /** OpenRouter's UPSTREAM generation handle (THEIR id namespace, opaque to us) — deliberately NOT a
   *  branded orbweaver id. */
  readonly generationId: ProviderGenerationId;
}

export interface ProvidersAvailableParams extends ActorParams {}

export interface RegisterPluginProvidersParams {
  readonly rows: readonly unknown[];
  readonly pluginId: PluginId;
  readonly pluginName: string;
}

export interface DropPluginProvidersParams {
  readonly pluginId: PluginId;
}

/** The local-light convenience seed's deps (inference program §7.2) — the db + clock + the two id minters. */
export interface LocalLightSeedDeps {
  readonly db: Db;
  readonly now: Clock;
  readonly newConnectionId: () => UserConnectionId;
  readonly newBindingId: () => ConnectionBindingId;
}
