// infra/providers/contract/diagnostics — the infra-internal REQUEST shapes for the diagnostic front door
// (probe · accountCredits · generationCost · inspect · fetchOrCatalog) plus the bound surface
// `ProviderDiagnostics` the `credentials`/`connection` domains call. Mirrors the role contract split: the
// credential-shaped requests carry the turn-time `credential` + a cancellation `signal` and stay infra
// (they hold a branded `ResolvedCredential` + an `AbortSignal`, neither a wire shape); the cross-boundary
// RESULT shapes (`AccountCredits`/`GenerationCost`/`EndpointInspection`) live in `@orb/contracts/providers`,
// `CredentialHealth` in `@orb/contracts/credentials`, `ModelCatalogEntry` in `@orb/contracts/connection`.
//
// The dispatcher (`createProviderDiagnostics`) discriminates probe/accountCredits/generationCost/inspect by
// `credential.source` (reusing `backendForSource`); `fetchOrCatalog` is OpenRouter-fixed (no credential).

import type { AgentSdkModel, ModelCatalogEntry } from "@orb/contracts/connection";
import type { CredentialHealth, ResolvedCredential } from "@orb/contracts/credentials";
import type { AccountCredits, EndpointInspection, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";

/** FLAG[PD-16]: Fields the credential-shaped diagnostic requests share. `signal` is the cross-surface
 *  cancellation hook. THREADED for `inspect` (the BYO inspector's fetch) and `verifyAuth` (the agent-sdk
 *  probe's AbortController). STILL unthreaded for the OpenRouter SDK ports (`accountCredits`/`generationCost`
 *  — `credits.getCredits()`/`generations.getGeneration()` take no options arg; blocked:upstream-sdk). */
interface DiagnosticRequestCommon {
  /** Resolved by credentials, handed in — discriminated by `source` at the dispatcher. */
  readonly credential: ResolvedCredential;
  readonly signal?: AbortSignal | undefined;
}

/** `probe(req)` — credential-health round-trip. Distinct named alias per verb (one home per surface). */
export type ProbeRequest = DiagnosticRequestCommon;

/** `accountCredits(req)` — the hosted account's balance. */
export type AccountCreditsRequest = DiagnosticRequestCommon;

/** `generationCost(req)` — the settled cost of one generation; read with the key that billed it. */
export interface GenerationCostRequest extends DiagnosticRequestCommon {
  /** The upstream generation id whose cost to settle. */
  readonly generationId: string;
}

/** `inspect(req)` — the "Test endpoint" probe against a user-wired BYO endpoint. The credential carries
 *  the base URL / key / headers; `model` is the model the ping is shaped for. */
export interface InspectRequest extends DiagnosticRequestCommon {
  readonly model: string;
}

/** `verifyAuth(req)` — the host-Claude auth verify (a tiny SDK turn reporting which credential the
 *  spawned runtime used). The credential is the owner-gated `max-pro-sub` mint (credentials enforces
 *  D17); `model` is the probe model the caller picked (the cheapest curated tier). */
export interface VerifyAuthRequest extends DiagnosticRequestCommon {
  readonly model: string;
}

/** `fetchOrCatalog(req)` — the live OpenRouter `/models` fetch. NO credential: the `/models` endpoint is
 *  public (the backend uses a keyless client); connection owns the snapshot + TTL cache above. */
export interface FetchCatalogRequest {
  readonly signal?: AbortSignal | undefined;
}

/** `fetchAgentSdkModels(req)` — the live agent-sdk `supportedModels()` control-channel discovery. NO
 *  credential: discovery is host-login-fixed (mode-1 firewall) and the daemon's model map is auth-agnostic;
 *  connection owns the snapshot + TTL cache. Distinct from {@link FetchCatalogRequest} (the OR fetch). */
export interface FetchAgentSdkModelsRequest {
  readonly signal?: AbortSignal | undefined;
}

/**
 * The bound diagnostic surface — `createProviderDiagnostics(deps)` returns this. probe/accountCredits/
 * generationCost/inspect dispatch on `credential.source` (fail-closed via the dispatch helpers when the
 * resolved backend doesn't implement the verb); `fetchOrCatalog` routes to the OpenRouter backend directly.
 * Consumers (credentials/connection) call these through the front door and never see a backend key.
 */
export interface ProviderDiagnostics {
  readonly probe: (req: ProbeRequest) => Promise<CredentialHealth>;
  readonly accountCredits: (req: AccountCreditsRequest) => Promise<AccountCredits>;
  readonly generationCost: (req: GenerationCostRequest) => Promise<GenerationCost>;
  readonly inspect: (req: InspectRequest) => Promise<EndpointInspection>;
  readonly verifyAuth: (req: VerifyAuthRequest) => Promise<VerifyAuthResult>;
  readonly fetchOrCatalog: (req: FetchCatalogRequest) => Promise<ModelCatalogEntry[]>;
  readonly fetchAgentSdkModels: (req: FetchAgentSdkModelsRequest) => Promise<AgentSdkModel[]>;
}
