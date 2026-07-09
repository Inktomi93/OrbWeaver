// domain/credentials/contract/service — the typed API surface (read THIS to know everything the domain
// does). Holds:
//   • CredentialContext       the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4)
//   • CredentialsServiceDeps  the deps the entry root supplies (identical to the context — no transform)
//   • CredentialsService      the 13-verb authoritative interface (the front door re-exports the type)
//
// Every cross-feature/infra dep arrives as an INJECTED op (credentials sideways-imports NO sibling
// runtime; the SecretBox + the provider probes + the owner guard are wired at the composition root):
//   - `box`          infra/crypto's `SecretBox` — the AES-256-GCM seam (type-only import; instance at root).
//   - `requireOwner` admin's owner-gate (D17) — type-only from the admin front door; gates `max-pro-sub`.
//   - `probe`        infra/providers' credential-health probe (testHealth wraps it).
//   - `inspect`      infra/providers' custom-endpoint inspector (inspectEndpoint wraps it).
//   - `fetchModels`  infra/network's best-effort `/models` fetch (fetch-models wraps it).
// db steps stay in `persistence/`; `now`/`newCredentialId` are the injected determinism seam (no ambient
// clock/id — testing §3).

import type { CredentialHealth, ResolvedCredential } from "@orb/contracts/credentials";
import type { EndpointInspection } from "@orb/contracts/providers";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { UserCredentialId } from "@orb/kit/ids";
import type { RequireOwner } from "#domain/admin";
import type { SecretBox } from "#infra/crypto";
import type {
  AddCredentialParams,
  ClearRevokedParams,
  FetchModelsParams,
  InspectEndpointParams,
  ListCredentialsParams,
  MarkRevokedByUserParams,
  MarkRevokedParams,
  MaybeRevokeParams,
  RemoveCredentialParams,
  ResolveCredentialParams,
  SetActiveParams,
  TestHealthParams,
} from "./params";
import type { CredentialView } from "./views";

/** The args the injected `/models` fetch op takes (infra/network's `fetchOpenAiModels` shape, declared
 *  here so the domain never imports the infra arg type). */
export interface FetchModelsArgs {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly headers: Record<string, string> | null;
}

/** Probe a resolved credential against its provider's health endpoint (testHealth's injected op). The
 *  credential is built (by id) in the verb and handed here; the root binds this to the providers probe. */
export type ProbeOp = (credential: ResolvedCredential) => Promise<CredentialHealth>;

/** Inspect a resolved custom_openai credential — the "Test endpoint" round-trip (inspectEndpoint's op). */
export type InspectOp = (req: {
  readonly credential: ResolvedCredential;
  readonly model: string;
}) => Promise<EndpointInspection>;

/** Best-effort `/models` fetch against a user-supplied endpoint (fetch-models' op; `[]` on any failure). */
export type FetchModelsOp = (args: FetchModelsArgs) => Promise<string[]>;

/**
 * The DI bundle the credential verbs close over (wired at the entry composition root; surfaced through
 * `context.ts`). `db` routes all queries through `persistence/`; `box` is the AES-256-GCM seam (carries
 * the AAD VALUE per call, never derives it); `requireOwner`/`probe`/`inspect`/`fetchModels` are the
 * injected cross-feature/infra ops; `now`/`newCredentialId` are the determinism seam.
 */
export interface CredentialContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newCredentialId: () => UserCredentialId;
  readonly box: SecretBox;
  readonly requireOwner: RequireOwner;
  readonly probe: ProbeOp;
  readonly inspect: InspectOp;
  readonly fetchModels: FetchModelsOp;
  /** The user-bus live-freshness emit (PD user-bus lane) — every user-facing credential mutation
   *  (add/setActive/remove/markRevokedByUser/clearRevoked) fires `credentialsChanged` with the owner's
   *  `userId` AFTER its durable write, so a second device's credential list refetches. Wired to transport's
   *  `publishUserEvent` at the entry root; fire-and-forget (LIVE-ONLY). */
  readonly emitUserEvent: EmitUserEvent;
}

/** What `createCredentialsService` receives from the entry root. Identical to {@link CredentialContext}
 *  — there is no deps→context transform here (unlike sessions' pepper→hasher), so the two are aliased;
 *  the name is kept for the front-door surface symmetry with the other domains. */
export type CredentialsServiceDeps = CredentialContext;

/**
 * The credential surface. The turn-time `resolve` is the ONLY consumer-facing
 * construction of a `ResolvedCredential`; CRUD is ownership-scoped (rows by `principal.userId`); health
 * has the runner-internal (`markRevoked`, no ownership check) vs user-facing (`markRevokedByUser`) split
 * (invariant #6 — MUST NOT merge).
 */
export interface CredentialsService {
  // Turn-time
  readonly resolve: (params: ResolveCredentialParams) => Promise<ResolvedCredential>;
  readonly maybeRevokeOnAuthFailed: (params: MaybeRevokeParams) => Promise<void>;

  // CRUD
  readonly add: (params: AddCredentialParams) => Promise<CredentialView>;
  readonly setActive: (params: SetActiveParams) => Promise<CredentialView>;
  readonly remove: (params: RemoveCredentialParams) => Promise<void>;
  readonly list: (params: ListCredentialsParams) => Promise<CredentialView[]>;

  // Health
  readonly testHealth: (params: TestHealthParams) => Promise<CredentialHealth>;
  /** Runner-internal revoke (NO ownership check — the runner proved access by holding the id). */
  readonly markRevoked: (params: MarkRevokedParams) => Promise<void>;
  /** User-facing revoke (adds the ownership check). MUST stay distinct from `markRevoked` (invariant #6). */
  readonly markRevokedByUser: (params: MarkRevokedByUserParams) => Promise<void>;
  readonly clearRevoked: (params: ClearRevokedParams) => Promise<void>;
  readonly probeKeyDecrypt: () => Promise<boolean>;

  // Custom endpoint
  readonly fetchModels: (params: FetchModelsParams) => Promise<string[]>;
  readonly inspectEndpoint: (params: InspectEndpointParams) => Promise<EndpointInspection>;
}
