// domain/credentials/contract/results — every verb's *Result, named once. Most results are cross-boundary
// types the runners/clients already own; these aliases give each verb a readable result name without
// re-declaring a shape.

import type {
  CredentialHealth,
  LocalLightCredential,
  OpenRouterCredential,
  ResolvedCredential,
  VllmCredential,
} from "@orb/contracts/credentials";
import type { EndpointInspection } from "@orb/contracts/providers";
import type { CredentialView } from "./views";

export type ResolveCredentialResult = ResolvedCredential;

export type CredentialViewResult = CredentialView;
export type ListCredentialsResult = readonly CredentialView[];

export type TestHealthResult = CredentialHealth;

export type InspectEndpointResult = EndpointInspection;

/** Best-effort model ids ([] on failure). */
export type FetchModelsResult = readonly string[];

export type MintVllmResult = VllmCredential;
export type MintLocalLightResult = LocalLightCredential;
export type KeylessCatalogResult = OpenRouterCredential;
