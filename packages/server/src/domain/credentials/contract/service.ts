// The typed API surface: CredentialContext (the DI bundle), CredentialsServiceDeps (entry-root deps), and
// CredentialsService (the verb interface). Every cross-feature/infra dep arrives as an injected op —
// credentials sideways-imports no sibling runtime.

import type { CredentialHealth, ResolvedCredential } from "@orb/contracts/credentials";
import type { EndpointInspection } from "@orb/contracts/providers";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { UserCredentialId } from "@orb/kit/ids";
import type { RequireOwner } from "#domain/admin";
import type { AuditEntry } from "#foundation/observability";
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
  ResolveGifSearchKeyParams,
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
type ProbeOp = (credential: ResolvedCredential) => Promise<CredentialHealth>;

/** Inspect a resolved custom_openai credential — the "Test endpoint" round-trip (inspectEndpoint's op). */
type InspectOp = (req: { readonly credential: ResolvedCredential; readonly model: string }) => Promise<EndpointInspection>;

/** Best-effort `/models` fetch against a user-supplied endpoint (fetch-models' op; `[]` on any failure). */
type FetchModelsOp = (args: FetchModelsArgs) => Promise<string[]>;

/** The DI bundle the credential verbs close over, wired at the composition root. */
export interface CredentialContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newCredentialId: () => UserCredentialId;
  readonly box: SecretBox;
  readonly requireOwner: RequireOwner;
  readonly probe: ProbeOp;
  readonly inspect: InspectOp;
  readonly fetchModels: FetchModelsOp;
  /** The db-bound best-effort `logAudit`, wired at the composition root (PD-142). Every credential mutation
   *  writes a durable `audit_logs` row IN ADDITION TO the ephemeral `securityEvent`/`emitUserEvent` — a leaked
   *  or rotated key must leave a persistent forensic trail, not just a pino line that ages out. Best-effort:
   *  the audit channel never breaks the primary mutation (see `foundation/observability/audit.ts`). */
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** Fires `credentialsChanged` with the owner's `userId` after every user-facing credential mutation's
   *  durable write, so a second device's list refetches. */
  readonly emitUserEvent: EmitUserEvent;
}

/** What `createCredentialsService` receives from the entry root; identical to {@link CredentialContext}. */
export type CredentialsServiceDeps = CredentialContext;

/** The credential surface. The turn-time `resolve` is the only consumer-facing construction of a
 *  `ResolvedCredential`; CRUD is ownership-scoped; health has the runner-internal (`markRevoked`) vs
 *  user-facing (`markRevokedByUser`) split — must not merge. */
export interface CredentialsService {
  // Turn-time
  readonly resolve: (params: ResolveCredentialParams) => Promise<ResolvedCredential>;
  readonly maybeRevokeOnAuthFailed: (params: MaybeRevokeParams) => Promise<void>;
  /** Resolve the acting principal's gif-search (Tenor) API key. Owner-scoped; the decrypted plaintext, or
   *  `null` when the user has no live gif-search credential. Never logs the key. */
  readonly resolveGifSearchKey: (params: ResolveGifSearchKeyParams) => Promise<string | null>;

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
