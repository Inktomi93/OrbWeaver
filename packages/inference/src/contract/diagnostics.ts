// The diagnostic request shapes + the bound `ProviderDiagnostics` surface the credentials/connection
// domains call (probe · accountCredits · generationCost · inspect · verifyAuth · listModels). Every request
// carries the `Resolved` connection it is about, so a diagnostic dispatches on the row's WIRE exactly as a
// task does; the three OpenRouter-only surfaces (credits, generation cost, the enriched catalog) are the
// transport's plain fetches (§8.2), reached through the same door.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { ModelCatalogEntry } from "@orb/contracts/inference";
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

/** The connection's model list by the provider's `catalog` strategy: `GET <baseUrl>/v1/models` (+ the
 *  OR-shaped enrichment where the dialect says so), the daemon's `supportedModels()`, or the builtin
 *  bundle. A failed/empty list is `{ listed: false }` — the pane offers a typed id and says why. */
export interface ListModelsRequest extends DiagnosticRequestCommon {}

export interface ListModelsResult {
  readonly listed: boolean;
  readonly models: readonly ModelCatalogEntry[];
}

export interface ProviderDiagnostics {
  readonly probe: (req: ProbeRequest) => Promise<CredentialHealth>;
  readonly accountCredits: (req: AccountCreditsRequest) => Promise<AccountCredits>;
  readonly generationCost: (req: GenerationCostRequest) => Promise<GenerationCost>;
  readonly inspect: (req: InspectRequest) => Promise<EndpointInspection>;
  readonly verifyAuth: (req: VerifyAuthRequest) => Promise<VerifyAuthResult>;
  readonly listModels: (req: ListModelsRequest) => Promise<ListModelsResult>;
}
