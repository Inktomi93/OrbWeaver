// infra/providers/diagnostics — the DIAGNOSTIC FRONT DOOR. `createProviderDiagnostics(deps)` binds the
// wired backend registry into the family-agnostic `ProviderDiagnostics` surface the `credentials`/`connection`
// domains call (probe / accountCredits / generationCost / inspect / fetchOrCatalog).
//
// probe/accountCredits/generationCost/inspect dispatch on `credential.source` via `backendForSource` and
// fail-closed via the shared `requireBackend` (unwired key → typed error) + `requireRoleImpl` (a resolved
// backend that doesn't implement the verb → typed error, NOT a silent `undefined` call). `fetchOrCatalog`
// is OpenRouter-FIXED (no credential — the public `/models` fetch connection injects), so it routes to the
// `openrouter` backend directly rather than through source dispatch.
//
// FLAG (which source × verb pairs are WIRED vs fail-closed): only `openrouter` ships probe/accountCredits/
// generationCost/fetchCatalog today, only `custom-byo` ships `inspect`, and only `agent-sdk` ships
// `verifyAuth` (the max-pro-sub host-login health check `connection.testClaudeAuth` drives). Every other
// (source × verb) fail-closes with a typed `ProviderError` — there is NO probe for max-pro-sub / vllm /
// local-light / custom_openai (and no accountCredits/generationCost off OpenRouter). Those are genuine
// not-yet-built surfaces, surfaced as a typed not-supported throw — never faked.

import type { AgentSdkModel, ModelCatalogEntry } from "@orb/contracts/connection";
import type { CredentialHealth } from "@orb/contracts/credentials";
import type { AccountCredits, EndpointInspection, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type {
  AccountCreditsRequest,
  BackendKey,
  FetchAgentSdkModelsRequest,
  FetchCatalogRequest,
  GenerationCostRequest,
  InspectRequest,
  ProbeRequest,
  ProviderDeps,
  ProviderDiagnostics,
  VerifyAuthRequest,
} from "./contract/index.ts";
import { backendForSource, requireBackend, requireRoleImpl } from "./roles/dispatch.ts";

// fetchOrCatalog is OpenRouter-fixed (the doc: "connection injects it specifically").
const OPENROUTER_KEY: BackendKey = "openrouter";
// fetchAgentSdkModels is agent-sdk-fixed — discovery is host-login (mode-1); no source dispatch.
const AGENT_SDK_KEY: BackendKey = "agent-sdk";

/**
 * Compose the bound diagnostic surface from a wired backend registry. Each method resolves the sealed
 * backend (by `credential.source`, or fixed to `openrouter` for the catalog fetch) and dispatches
 * fail-closed.
 */
export function createProviderDiagnostics(deps: ProviderDeps): ProviderDiagnostics {
  return {
    probe: async (req: ProbeRequest): Promise<CredentialHealth> => {
      const backend = requireBackend(deps.backends, backendForSource(req.credential.source), "probe");
      return await requireRoleImpl(backend, backend.probe, "probe")(req);
    },
    accountCredits: async (req: AccountCreditsRequest): Promise<AccountCredits> => {
      const backend = requireBackend(deps.backends, backendForSource(req.credential.source), "accountCredits");
      return await requireRoleImpl(backend, backend.accountCredits, "accountCredits")(req);
    },
    generationCost: async (req: GenerationCostRequest): Promise<GenerationCost> => {
      const backend = requireBackend(deps.backends, backendForSource(req.credential.source), "generationCost");
      return await requireRoleImpl(backend, backend.generationCost, "generationCost")(req);
    },
    inspect: async (req: InspectRequest): Promise<EndpointInspection> => {
      const backend = requireBackend(deps.backends, backendForSource(req.credential.source), "inspect");
      return await requireRoleImpl(backend, backend.inspect, "inspect")(req);
    },
    verifyAuth: async (req: VerifyAuthRequest): Promise<VerifyAuthResult> => {
      const backend = requireBackend(deps.backends, backendForSource(req.credential.source), "verifyAuth");
      return await requireRoleImpl(backend, backend.verifyAuth, "verifyAuth")(req);
    },
    fetchOrCatalog: async (req: FetchCatalogRequest): Promise<ModelCatalogEntry[]> => {
      const backend = requireBackend(deps.backends, OPENROUTER_KEY, "fetchCatalog");
      return await requireRoleImpl(backend, backend.fetchCatalog, "fetchCatalog")(req);
    },
    fetchAgentSdkModels: async (req: FetchAgentSdkModelsRequest): Promise<AgentSdkModel[]> => {
      const backend = requireBackend(deps.backends, AGENT_SDK_KEY, "fetchModels");
      return await requireRoleImpl(backend, backend.fetchModels, "fetchModels")(req);
    },
  };
}
