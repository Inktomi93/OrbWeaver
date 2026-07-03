// domain/connection/contract/service — the typed API surface (read THIS to know everything the domain
// does). Holds:
//   • ConnectionContext       the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4)
//   • ConnectionServiceDeps   what the entry root supplies (identical to the context — no transform)
//   • ConnectionService       the 5-verb authoritative interface (the front door re-exports the type)
//
// Every cross-feature/infra dep arrives as an INJECTED op (connection sideways-imports NO sibling runtime —
// domain-no-cross-feature; the ops are wired at the composition root):
//   - `resolveCredential`  credentials.resolve — resolves the `{source}` credential for any role/turn.
//   - `fetchOrCatalog`     infra/providers.fetchOrCatalog — the live OR `/models` fetch (keyless; connection
//                          owns the SNAPSHOT + TTL cache). NOTE: neo injected a keyless catalog credential;
//                          orbweaver's `fetchOrCatalog` is credential-free, so that mint is NOT injected.
//   - `loadUserSettings`   settings.loadUserSettings — the per-user `routing.roleDefaults.*` projection.
// db steps stay in `persistence/`; `now` is the injected determinism seam (no ambient clock — testing §3).

import type {
  ChatSource,
  ModelCapability,
  ModelCatalogEntry,
  ResolvedConnection,
} from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { AccountCredits, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type {
  GetCatalogParams,
  GetGenerationCostParams,
  GetModelCapabilityParams,
  GetOrCreditsParams,
  RefreshCatalogParams,
  ResolveChatParams,
  ResolveRoleParams,
  TestClaudeAuthParams,
} from "./params";
import type { CatalogSnapshot } from "./results";

/** credentials.resolve — resolve the brand-protected credential for a `{principal, source}`. The
 *  `max-pro-sub` owner gate lives in credentials; connection never re-checks it. */
export type ResolveCredentialOp = (params: {
  readonly principal: Principal;
  readonly source: ChatSource;
}) => Promise<ResolvedCredential>;

/** infra/providers.fetchOrCatalog — the live OpenRouter `/models` fetch (keyless, no credential). Returns
 *  the normalized cross-boundary entries connection persists in its snapshot. */
export type FetchOrCatalogOp = (req: {
  readonly signal?: AbortSignal | undefined;
}) => Promise<ModelCatalogEntry[]>;

/** settings.loadUserSettings — the parsed per-user UserSettings (the `routing.roleDefaults.*` source).
 *  Connection is a CONSUMER of settings, not an owner. */
export type LoadUserSettingsOp = (userId: UserId) => Promise<UserSettings>;

/** infra/providers.verifyAuth — the host-Claude auth-verify diagnostic (a tiny SDK turn through the
 *  credential firewall reporting which credential the spawned runtime used). The credential is the
 *  owner-gated `max-pro-sub` mint this domain resolves FIRST (D17 lives in credentials — connection
 *  never re-checks it); `model` is the probe model the verb picks (the cheapest curated tier). */
export type VerifyClaudeAuthOp = (req: {
  readonly credential: ResolvedCredential;
  readonly model: string;
}) => Promise<VerifyAuthResult>;

/** infra/providers.accountCredits — the OpenRouter credit-balance read (works on any inference key).
 *  The credential is the caller's resolved `openrouter` key (a missing/revoked key rejects in
 *  `credentials.resolve` with `DomainNoCredentialError` BEFORE this op is reached). */
export type AccountCreditsOp = (req: {
  readonly credential: ResolvedCredential;
  readonly signal?: AbortSignal | undefined;
}) => Promise<AccountCredits>;

/** infra/providers.generationCost — the settled upstream cost of ONE generation (must be read with the
 *  key that billed it; lands a few seconds after the turn). Same no-key rejection path as credits. */
export type GenerationCostOp = (req: {
  readonly credential: ResolvedCredential;
  readonly generationId: string;
  readonly signal?: AbortSignal | undefined;
}) => Promise<GenerationCost>;

/**
 * The DI bundle the connection verbs close over (wired at the entry composition root; surfaced through
 * `context.ts`). `db` routes the catalog-snapshot KV through `persistence/`; the three ops are the injected
 * cross-feature/infra seams; `now` is the determinism seam (the TTL cache clock).
 */
export interface ConnectionContext {
  readonly db: Db;
  readonly now: () => number;
  readonly resolveCredential: ResolveCredentialOp;
  readonly fetchOrCatalog: FetchOrCatalogOp;
  readonly loadUserSettings: LoadUserSettingsOp;
  readonly verifyClaudeAuth: VerifyClaudeAuthOp;
  readonly accountCredits: AccountCreditsOp;
  readonly generationCost: GenerationCostOp;
  /** The boot GPU/vLLM-availability fact (`!VLLM_DISABLED && gpuPresent`), threaded from `entry/lifecycle`
   *  via compose. When `false`, `resolveRole` reroutes the DERIVE roles (embed/rerank/imageEmbed) that
   *  resolved to `vllm` onto the in-process `local-light` tier (the generation roles never fall back —
   *  local-light has no generation). The ONE input the resolver reads for the no-GPU derive fallback. */
  readonly vllmAvailable: boolean;
}

/** What `createConnectionService` receives from the entry root. Identical to {@link ConnectionContext} —
 *  no deps→context transform; the name is kept for front-door surface symmetry with the other domains. */
export type ConnectionServiceDeps = ConnectionContext;

/**
 * The connection surface — SELECTION, not execution. `resolveRole` is the generic
 * 7-role resolver; `resolveChat` is the chat-specific overlay (chat row beats UserSettings beats system
 * default, then heal) delegating to `resolveRole('chat')`; `getModelCapability` produces the ONE descriptor
 * for the panel/translator; `getCatalog`/`refreshCatalog` own the OR snapshot. NONE carry `runner`/`family`
 * (sealed in infra).
 */
export interface ConnectionService {
  readonly resolveRole: (params: ResolveRoleParams) => Promise<ResolvedConnection>;
  readonly resolveChat: (params: ResolveChatParams) => Promise<ResolvedConnection>;
  readonly getModelCapability: (params: GetModelCapabilityParams) => Promise<ModelCapability>;
  readonly getCatalog: (params: GetCatalogParams) => Promise<CatalogSnapshot>;
  readonly refreshCatalog: (params: RefreshCatalogParams) => Promise<CatalogSnapshot>;
  /** The max-pro-sub HEALTH CHECK (neo `models.testClaudeAuth`, Tier-4-Transport.md): resolve the
   *  owner-gated `max-pro-sub` credential (credentials enforces D17 — a non-owner rejects there), then run
   *  the tiny SDK verify turn on the cheapest curated tier. `apiKeySource === "none"` = host login active. */
  readonly testClaudeAuth: (params: TestClaudeAuthParams) => Promise<VerifyAuthResult>;
  /** The caller's OpenRouter credit balance (neo `models.credits` — the account panel read). Resolves
   *  the caller's `openrouter` key first: no/revoked key → `DomainNoCredentialError` (the client banner
   *  floor), never a fabricated zero balance. */
  readonly getOrCredits: (params: GetOrCreditsParams) => Promise<AccountCredits>;
  /** The settled cost of one OpenRouter generation (read with the caller's key — the one that billed
   *  it). Same `DomainNoCredentialError` floor as {@link getOrCredits}. */
  readonly getGenerationCost: (params: GetGenerationCostParams) => Promise<GenerationCost>;
}
