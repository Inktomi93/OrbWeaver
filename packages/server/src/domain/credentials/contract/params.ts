// domain/credentials/contract/params — every verb's *Params, declared ONCE (§7.4). Under the Principal
// model the loose `userId`/`role` fields collapse into ONE `principal: Principal` (resolved at the entry
// seam, carries its role) — a CRUD verb scopes its rows by `principal.userId` and NEVER reads the `users`
// table (the `no-direct-users-read` chokepoint is RED on credentials). The KEY/label strings are raw here
// (validated at the verb/transport boundary); ids/provider/source are branded.

import type {
  CredentialProvider,
  CredentialSource,
  ProviderMetadata,
} from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { UserCredentialId } from "@orb/kit/ids";

/** Common to every ownership-scoped credential verb: the acting principal (`principal.userId` is the
 *  row owner; the guard reads `principal.role`). The runner-internal `markRevoked` is the ONE verb that
 *  does NOT extend this — the runner has only the credentialId (it proved access by holding it). */
export interface CredentialActorParams {
  readonly principal: Principal;
}

// --- Turn-time -----------------------------------------------------------------
/** The turn-time resolver input. `source` is the DISPATCH axis (5 arms); the `max-pro-sub` arm gates on
 *  `principal.role === 'owner'` (D17) before minting the owner's box credential. */
export interface ResolveCredentialParams extends CredentialActorParams {
  readonly source: CredentialSource;
}

/** Resolve the ACTING principal's `gif-search` (Tenor) API key — the non-LLM external-service resolver
 *  (D61 gallery-design §5). Owner-scoped off `principal.userId` (no cross-user credential read); returns
 *  the decrypted plaintext or `null` when the user has no live gif-search credential. NOT the turn-time
 *  `resolve` path (gif-search has no runner arm). */
export interface ResolveGifSearchKeyParams extends CredentialActorParams {}

/** Post-turn `auth_failed` side-effect input (chat + compaction inject this verb). `credentialId` is
 *  `null` for keyless sources (vllm/local-light/max-pro-sub) — those have no row to revoke. */
export interface MaybeRevokeParams {
  readonly credentialId: UserCredentialId | null;
  readonly errorKind: string;
  readonly errorMessage: string;
}

// --- CRUD ----------------------------------------------------------------------
export interface ListCredentialsParams extends CredentialActorParams {}

export interface AddCredentialParams extends CredentialActorParams {
  readonly provider: CredentialProvider;
  /** Optional — defaults to `"default"` inside the verb. Per-user labels disambiguate multiple keys. */
  readonly label?: string;
  /** The raw secret to seal (AES-256-GCM, AAD = `${ownerId}|${provider}`). Never persisted in clear. */
  readonly key: string;
  readonly metadata?: ProviderMetadata;
}

export interface SetActiveParams extends CredentialActorParams {
  readonly credentialId: UserCredentialId;
}

export interface RemoveCredentialParams extends CredentialActorParams {
  readonly credentialId: UserCredentialId;
}

// --- Health --------------------------------------------------------------------
export interface TestHealthParams extends CredentialActorParams {
  readonly credentialId: UserCredentialId;
}

/** Runner-internal revoke — NO principal (the runner discovers a 401 and reports the credentialId; the
 *  id IS the access token at this layer). Public callers use {@link MarkRevokedByUserParams}. `reason` is
 *  log-only (orbweaver's schema has no `revoked_reason` column — only `revoked_at` is persisted). */
export interface MarkRevokedParams {
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

// --- Custom endpoint -----------------------------------------------------------
/** The unsaved "Add endpoint" form fields — the DRAFT arm of {@link FetchModelsParams}. */
export interface CustomEndpointDraft {
  readonly baseUrl: string;
  readonly key?: string | undefined;
  readonly headers?: Record<string, string> | undefined;
}

/** Fetch the model-id list from a custom_openai endpoint. `draft` (raw form fields, pre-save) wins over
 *  `credentialId` (an existing saved row); neither present → `[]`. Best-effort — the UI falls back to
 *  manual model entry on any failure. */
export interface FetchModelsParams extends CredentialActorParams {
  readonly credentialId?: UserCredentialId | undefined;
  readonly draft?: CustomEndpointDraft | undefined;
}

/** Run the "Test endpoint" probe for a SAVED custom_openai credential (by id). The draft (pre-save)
 *  inspect arm is DEFERRED — see `verbs/inspect-endpoint.ts`. `model` overrides the credential's
 *  metadata `model` for the ping shape. */
export interface InspectEndpointParams extends CredentialActorParams {
  readonly credentialId: UserCredentialId;
  readonly model?: string | undefined;
}

// --- Boot / connection helpers -------------------------------------------------
/** The keyless OR catalog credential takes no input — the `/models` endpoint is public, so the resolved
 *  credential carries an empty key and no row. Declared for the front-door surface symmetry. */
export type KeylessCatalogParams = Record<string, never>;
