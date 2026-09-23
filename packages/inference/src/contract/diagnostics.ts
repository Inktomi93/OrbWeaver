// The diagnostic request shapes + the bound `ProviderDiagnostics` surface the credentials/connection
// domains call (probe · accountCredits · generationCost · inspect · verifyAuth · listModels). Every request
// carries the `Resolved` connection it is about, so a diagnostic dispatches on the row's WIRE exactly as a
// task does; the three OpenRouter-only surfaces (credits, generation cost, the enriched catalog) are the
// transport's plain fetches (§8.2), reached through the same door.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { ModelListing } from "@orb/contracts/inference";
import type { AccountCredits, EndpointInspection, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { Resolved } from "./resolved.ts";

interface DiagnosticRequestCommon {
  readonly connection: Resolved;
  readonly signal?: AbortSignal | undefined;
}

/** Credential-health round-trip. */
export type ProbeRequest = DiagnosticRequestCommon;

export type AccountCreditsRequest = DiagnosticRequestCommon;

export interface GenerationCostRequest extends DiagnosticRequestCommon {
  readonly generationId: string;
}

/** The "Test endpoint" inspector against an `auth: endpoint` row — the ACTUAL shaped request (headers
 *  redacted) plus the raw response. */
export type InspectRequest = DiagnosticRequestCommon;

/** The subscription auth verify — a tiny SDK turn under THIS user's claude-sub row. */
export type VerifyAuthRequest = DiagnosticRequestCommon;

/** What a model-list read needs from a connection: which wire and provider, whose credential, which server.
 *  Narrower than `Resolved` on purpose — a DRAFT (no row, no model, no capability yet) lists through the same
 *  backend method, so the request never carries fields a draft would have to invent. */
export type CatalogTarget = Pick<Resolved, "wire" | "ownerId" | "providerId" | "provider" | "baseUrl" | "credential" | "transport">;

/** The connection's model list by the provider's `catalog` strategy: `GET <baseUrl>/v1/models` (+ the
 *  OR-shaped enrichment where the dialect says so) or the daemon's `supportedModels()`. A failed or empty
 *  list is `{ listed: false, reason }` — the pane offers a typed id and says why. */
export interface ListModelsRequest {
  readonly connection: CatalogTarget;
  readonly signal?: AbortSignal | undefined;
}

export interface ProviderDiagnostics {
  readonly probe: (req: ProbeRequest) => Promise<CredentialHealth>;
  readonly accountCredits: (req: AccountCreditsRequest) => Promise<AccountCredits>;
  readonly generationCost: (req: GenerationCostRequest) => Promise<GenerationCost>;
  readonly inspect: (req: InspectRequest) => Promise<EndpointInspection>;
  readonly verifyAuth: (req: VerifyAuthRequest) => Promise<VerifyAuthResult>;
  readonly listModels: (req: ListModelsRequest) => Promise<ModelListing>;
}
