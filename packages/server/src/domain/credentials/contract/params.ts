// Every verb's *Params. A CRUD verb scopes its rows by `principal.userId` and never reads the `users`
// table. Key/label strings are raw here (validated at the verb/transport boundary); ids are branded and
// `provider` is the registry id string the domain validates against the registry.

import type { CredentialHealth, ProviderMetadata } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { ProviderId } from "@orb/contracts/inference";
import type { ProviderErrorKind } from "@orb/inference";
import type { UserCredentialId, UserId } from "@orb/kit/ids";

/** Common to every ownership-scoped credential verb: the acting principal (`principal.userId` is the
 *  row owner). The runner-internal `markRevoked` is the ONE verb that does NOT extend this — the runner has
 *  only the credentialId (it proved access by holding it). */
interface CredentialActorParams {
  readonly principal: Principal;
}

/** The turn-time resolver input — BY ID, off the connection row (inference program §5.3): `ownerId` is the
 *  tenant scope AND the AAD half (a stranger's row decrypt-fails there, never silently resolves), `providerId`
 *  the other AAD half. `credentialId: null` is the keyless arm (`auth: none`, an open endpoint) and mints the
 *  `kind: "none"` secret. */
export interface ResolveCredentialParams {
  readonly ownerId: UserId;
  readonly credentialId: UserCredentialId | null;
  readonly providerId: ProviderId;
}

/** Post-generation `auth_failed` side-effect input (the chat engine's three generation catch seams and the
 *  role-clients strike-out inject this verb). `credentialId` is `null` for keyless rows — no row to revoke —
 *  and is the id the generation ACTUALLY authenticated with, never a post-failure re-resolve (a rotate between
 *  the rejection and the strike would otherwise revoke the user's new, good key).
 *
 *  `errorKind` is the CLOSED provider union, not a free string (#1373): an open discriminator on an INJECTED op
 *  is precisely what hid the defect for the life of the feature. `errorMessage` is operator-facing provenance
 *  that reaches the security-event log, so it must be secret-free — `ProviderError.message` is contractually so.
 *
 *  `ownerId` IS THE SCOPE (`injected-op-caller-param`): it becomes the WHERE predicate of the revoke, so a
 *  credentialId this owner does not hold matches no row and the strike refuses loudly. */
export interface MaybeRevokeParams {
  readonly ownerId: UserId;
  readonly credentialId: UserCredentialId | null;
  readonly errorKind: ProviderErrorKind;
  readonly errorMessage: string;
}

/** The ROW half of a connection probe. `result` is the diagnostic's verdict (the connection domain dialled);
 *  `localEndpoint` says the dialled host was loopback/LAN — an offline box there is a REACHABILITY fact, never
 *  a credential problem, so it must not feed the auto-revoke strike counter (owner ruling). */
export interface RecordProbeOutcomeParams extends CredentialActorParams {
  readonly credentialId: UserCredentialId;
  readonly result: CredentialHealth;
  readonly localEndpoint: boolean;
}

export interface ListCredentialsParams extends CredentialActorParams {}

export interface AddCredentialParams extends CredentialActorParams {
  /** The provider REGISTRY id (validated against the registry in the verb). */
  readonly provider: string;
  /** Optional — defaults to `"default"` inside the verb. A label the owner already holds on this provider gets
   *  the next free spelling; `add` never overwrites an existing key. */
  readonly label?: string;
  /** The raw secret to seal (AES-256-GCM, AAD = `${ownerId}|${provider}`). Never persisted in clear. */
  readonly key: string;
  readonly metadata?: ProviderMetadata;
}

/** Replace one stored key's secret in place, named by id. */
export interface ReplaceCredentialParams extends CredentialActorParams {
  readonly credentialId: UserCredentialId;
  /** The new raw secret, sealed under the row's own provider. */
  readonly key: string;
}

export interface RemoveCredentialParams extends CredentialActorParams {
  readonly credentialId: UserCredentialId;
}

/** Runner-internal revoke — no Principal (the runner discovers a 401 and reports the id), but it DOES carry
 *  the `ownerId` the row must belong to: the write is owner-scoped, so "no Principal" now means "no role
 *  check", never "no tenant scope". Public callers use {@link MarkRevokedByUserParams}. `reason` is log-only
 *  free text; the PERSISTED cause is the `CRED_REVOKED_REASONS` member the verb writes. */
export interface MarkRevokedParams {
  readonly ownerId: UserId;
  readonly credentialId: UserCredentialId;
  readonly reason: string;
}

export interface MarkRevokedByUserParams extends CredentialActorParams {
  readonly credentialId: UserCredentialId;
  /** Defaults to `"manually revoked by user"` inside the verb (log-only). */
  readonly reason?: string;
}

export interface ClearRevokedParams extends CredentialActorParams {
  readonly credentialId: UserCredentialId;
}
