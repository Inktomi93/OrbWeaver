// domain/credentials/contract/results — every verb's *Result, named once (§7.4; the "API readme as code"
// slot). Most results are cross-boundary types the runners/clients already own — `ResolvedCredential` +
// its arms and `CredentialHealth` live in `@orb/contracts/credentials`, `EndpointInspection` in
// `@orb/contracts/providers`, `CredentialView` in the domain's `views.ts`. These aliases give each verb a
// readable result name without re-declaring a shape (one home — derive, don't re-spell).

import type {
  CredentialHealth,
  LocalLightCredential,
  OpenRouterCredential,
  ResolvedCredential,
  VllmCredential,
} from "@orb/contracts/credentials";
import type { EndpointInspection } from "@orb/contracts/providers";
import type { CredentialView } from "./views";

/** Turn-time resolver result — the brand-protected union the `infra/providers` runners consume. */
export type ResolveCredentialResult = ResolvedCredential;

/** CRUD results — the secret-free read-model (`add`/`setActive` return the affected row). */
export type CredentialViewResult = CredentialView;
export type ListCredentialsResult = readonly CredentialView[];

/** Health probe result (incl. the service-side `throttled` state the provider can't know about). */
export type TestHealthResult = CredentialHealth;

/** Custom-endpoint inspector result — the redacted request + raw response (the key never leaves). */
export type InspectEndpointResult = EndpointInspection;

/** The "Test endpoint"/connection model-listing result — best-effort model ids (`[]` on failure). */
export type FetchModelsResult = readonly string[];

/** Boot/connection helper results — the keyless local/owner-box markers + the public-catalog credential. */
export type MintVllmResult = VllmCredential;
export type MintLocalLightResult = LocalLightCredential;
export type KeylessCatalogResult = OpenRouterCredential;
