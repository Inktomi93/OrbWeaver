// The typed API surface: CredentialContext (the DI bundle, which the entry root passes straight to
// createCredentialsService) and CredentialsService (the verb interface). Every cross-feature/infra dep arrives as
// an injected op — credentials sideways-imports no sibling runtime.
//
// UNDER CONNECTIONS-AS-THE-UNIT (inference program §5.3, ground5 M9): a credential row is a SEALED SECRET WITH A
// LABEL, and connections give it meaning. WHICH key resolves is the connection's `credentialId` — there is no
// `active` flag, no `setActive`, no per-provider slot resolution. The endpoint diagnostics that used to live here
// (`testHealth`'s dial, `inspectEndpoint`, `fetchModels`) are CONNECTION verbs now (the URL is on the connection
// row); what stays here is the ROW side of a probe outcome — `recordProbeOutcome` writes the revocation / strike
// consequences, because only this domain writes `user_credentials`.

import type { CredentialHealth, ResolvedSecret } from "@orb/contracts/credentials";
import type { ProviderDef } from "@orb/contracts/inference";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type { SecretBox } from "#infra/crypto";
import type {
  AddCredentialParams,
  ClearRevokedParams,
  ListCredentialsParams,
  MarkRevokedByUserParams,
  MarkRevokedParams,
  MaybeRevokeParams,
  RecordProbeOutcomeParams,
  RemoveCredentialParams,
  ResolveCredentialParams,
} from "./params.ts";
import type { CredentialStorageStatus, CredentialView } from "./views.ts";

/** The DI bundle the credential verbs close over, wired at the composition root. */
export interface CredentialContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newCredentialId: () => UserCredentialId;
  readonly box: SecretBox;
  /** The provider row `viewer` may use (built-in ∪ runtime rows; a plugin row only for the owner of an enabled
   *  install contributing it, D147), or undefined. `add` uses the row's branded id directly: the id is half the
   *  AAD, so membership validation and branding must be one operation. */
  readonly findProvider: (providerId: string, viewer: UserId) => ProviderDef | undefined;
  /** The db-bound best-effort `logAudit`, wired at the composition root (PD-142). Every credential mutation
   *  writes a durable `audit_logs` row IN ADDITION TO the ephemeral `securityEvent`/`emitUserEvent` — a leaked
   *  or rotated key must leave a persistent forensic trail, not just a pino line that ages out. Best-effort:
   *  the audit channel never breaks the primary mutation (see `foundation/observability/audit.ts`). */
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** Fires `credentialsChanged` with the owner's `userId` after every user-facing credential mutation's
   *  durable write, so a second device's list refetches. */
  readonly emitUserEvent: EmitUserEvent;
}

/** The credential surface. The turn-time `resolve` is the only consumer-facing construction of a
 *  `ResolvedSecret`; CRUD is ownership-scoped; health has the runner-internal (`markRevoked`) vs
 *  user-facing (`markRevokedByUser`) split — must not merge. */
export interface CredentialsService {
  // Turn-time
  readonly resolve: (params: ResolveCredentialParams) => Promise<ResolvedSecret>;
  readonly maybeRevokeOnAuthFailed: (params: MaybeRevokeParams) => Promise<void>;
  /** The ROW half of a connection probe (the connection domain dials; this domain records): applies the
   *  revoke / strike / clear consequences of a `CredentialHealth` verdict and re-stamps `checkedAt`. */
  readonly recordProbeOutcome: (params: RecordProbeOutcomeParams) => Promise<CredentialHealth>;

  // CRUD
  readonly add: (params: AddCredentialParams) => Promise<CredentialView>;
  readonly remove: (params: RemoveCredentialParams) => Promise<void>;
  readonly list: (params: ListCredentialsParams) => Promise<CredentialView[]>;
  /** Is per-user credential STORAGE configured on this deployment (CREDENTIAL-STORAGE-SILENT-FAIL)? The READ
   *  half of the `credentials_disabled` refusal every write verb already carries — asked BEFORE a secret is
   *  typed, so the UI can refuse the input instead of collecting a key it cannot keep. Param-free: the answer
   *  is a property of the deployment, identical for every caller, and names no row. */
  readonly storageStatus: () => Promise<CredentialStorageStatus>;

  // Health
  /** Runner-internal revoke (NO ownership check — the runner proved access by holding the id). */
  readonly markRevoked: (params: MarkRevokedParams) => Promise<void>;
  /** User-facing revoke (adds the ownership check). MUST stay distinct from `markRevoked` (invariant #6). */
  readonly markRevokedByUser: (params: MarkRevokedByUserParams) => Promise<void>;
  readonly clearRevoked: (params: ClearRevokedParams) => Promise<void>;
  readonly probeKeyDecrypt: () => Promise<boolean>;
}
