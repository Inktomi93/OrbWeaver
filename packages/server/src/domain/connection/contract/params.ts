// domain/connection/contract/params — every verb's *Params, declared ONCE (§7.4). The acting `principal`
// (resolved at the entry seam) scopes every read and write to its own rows; connection NEVER reads the `users`
// table (no-direct-users-read). The cross-boundary shapes (`UserConnection`, `ConnectionBinding`, `Task`,
// `RoutableTask`, the capability schemas) live in `@orb/contracts/inference`; the verb wrappers live here.

import type { Principal } from "@orb/contracts/identity";
import type {
  BindingActorKind,
  ConnectionApi,
  ConnectionExtrasDoc,
  ConnectionTransportDoc,
  DeclaredCapability,
  ProviderDef,
  RoutableTask,
  Task,
} from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import type { BindingActor } from "@orb/inference";
import type { AutomationRuleId, ConnectionBindingId, PluginId, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";

interface ActorParams {
  readonly principal: Principal;
}

/** `resolve` / `availability` — the runtime's fold for ONE task under the caller (the funder), optionally in the
 *  context of an actor (a rule, a plugin grant) or against an explicit row. */
export interface ResolveTaskParams extends ActorParams {
  readonly task: Task;
  readonly actor?: BindingActor | undefined;
  readonly connectionId?: UserConnectionId | undefined;
}

/** `resolveChatCapability` — the caller's OWN chat connection, credential-free (the params panel, the rpg lite
 *  gate, the Connections pane's readout). */
export interface ResolveChatCapabilityParams extends ActorParams {}

export interface ListConnectionsParams extends ActorParams {}

export interface GetConnectionParams extends ActorParams {
  readonly connectionId: UserConnectionId;
}

/** The writable fields of a connection row (everything but id / owner / timestamps). */
export interface ConnectionFields {
  readonly label?: string | undefined;
  readonly providerId: string;
  readonly credentialId: UserCredentialId | null;
  readonly baseUrl: string | null;
  readonly model: string;
  readonly api?: ConnectionApi | undefined;
  readonly declared?: DeclaredCapability | null | undefined;
  readonly extras?: ConnectionExtrasDoc | null | undefined;
  readonly transport?: ConnectionTransportDoc | null | undefined;
  readonly modelListed?: boolean | undefined;
  readonly allowBackground?: boolean | undefined;
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
export interface StoredActor {
  readonly actorKind: BindingActorKind;
  readonly actorId: string;
}

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

/** `useForEverything` — write every compatible `user` binding for a row at once (§5.3a, the 90% case). */
export interface UseForEverythingParams extends ActorParams {
  readonly connectionId: UserConnectionId;
}

export interface CatalogModelsParams extends ActorParams {
  readonly connectionId: UserConnectionId;
}

/** `listEndpointModels` — the pane's SERVER-SIDE `GET <baseUrl>/v1/models` for an endpoint row being authored
 *  (a browser cannot reach a user's loopback box); rides the F12 admission + the SSRF guard. A saved credential
 *  id OR a raw draft key, never both. */
export interface ListEndpointModelsParams extends ActorParams {
  readonly baseUrl: string;
  readonly credentialId?: UserCredentialId | undefined;
  readonly key?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export interface RefreshCatalogParams {
  readonly providerId: string;
  readonly signal?: AbortSignal | undefined;
}

export interface ConnectionDiagnosticParams extends ActorParams {
  readonly connectionId: UserConnectionId;
  readonly signal?: AbortSignal | undefined;
}

export interface GenerationCostParams extends ConnectionDiagnosticParams {
  /** OpenRouter's UPSTREAM generation handle (THEIR id namespace, opaque to us) — deliberately NOT a
   *  branded orbweaver id. */
  readonly generationId: string;
}

export interface ProvidersAvailableParams extends ActorParams {}

export interface RegisterProviderParams {
  readonly row: unknown;
  readonly origin: { readonly plugin: PluginId; readonly pluginName: string } | { readonly admin: UserId };
}

export interface DropProviderParams {
  readonly providerId: ProviderDef["id"];
}

/** The local-light convenience seed's deps (inference program §7.2) — the db + clock + the two id minters. */
export interface LocalLightSeedDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly newConnectionId: () => UserConnectionId;
  readonly newBindingId: () => ConnectionBindingId;
}
