// Shared test harness for the credentials domain (NOT a test file — no `.test` suffix, so test-layout
// ignores it). Builds a real-db `CredentialContext` with: injected determinism (frozen clock + seeded
// ids), the REAL AES-256-GCM `SecretBox` over a known key (so the AAD round-trip + wrong-AAD failure are
// exercised for real, not mocked), and a `findProvider` lookup over the built-in registry — the
// sanctioned "fake at the edges, inject at the root" doctrine (testing §3). Under connections-as-the-unit a
// credential is a sealed secret with a label: the probes/inspect/fetch-models ops LEFT this domain for the
// connection router (inference program §5.3), so there is nothing left here to fake but the audit recorder.

import type { CredentialExecutionEvidence } from "@orb/contracts/credentials";
import type { ProviderId } from "@orb/contracts/inference";
import { databaseHandle } from "@orb/db/wiring-driver";
import { handleKey } from "@orb/kit/handle-key";
import { createFrozenClock, FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import type { Principal, UserRole } from "#contracts/identity/index.ts";
import { builtinProvider } from "#contracts/inference/index.ts";
import type { Db } from "#db/client/index.ts";
import { users } from "#db/schema/index.ts";
import type { Handle, UserCredentialId, UserId } from "#kit/ids/index.ts";
import { castId } from "#kit/ids/index.ts";
import type { CredentialAssemblyContext as CredentialContext } from "#server/domain/credentials/contract/service.ts";
import type { CredentialView } from "#server/domain/credentials/contract/views.ts";
import type { CredentialsService } from "#server/domain/credentials/index.ts";
import { createCredentialsService } from "#server/domain/credentials/index.ts";
import { createSecretBox } from "#server/infra/crypto/secrets.ts";
import { principal as makePrincipal } from "../../../db/schema/_support.ts";

// A fixed 32-byte key so the SecretBox is enabled + deterministic across runs.
const TEST_KEY = Buffer.alloc(32, 7);

// A PROCESS-MONOTONIC credential-id counter (deterministic, no clock/random — testing §3). Per-harness
// reset would collide across tests in a file: the health throttle Map is module-scope (per-process), so a
// reused credentialId would hit a stale throttle window. A monotonic counter keeps every minted id unique.
let credentialIdCounter = 0;
function nextCredentialId(): UserCredentialId {
  credentialIdCounter += 1;
  return castId<UserCredentialId>(`user_credential_${credentialIdCounter}`);
}

/** A recorded `audit` op call — tests assert every credential mutation writes a durable row. */
interface AuditCall {
  readonly entry: Parameters<CredentialContext["audit"]>[0];
  readonly at: number;
}

/** The harness: the CredentialContext + the recorders/setters for the faked injected ops. */
export interface CredentialHarness {
  readonly ctx: CredentialContext;
  /** The recorded `audit` op calls — assert each mutation writes a durable audit row. */
  readonly audits: AuditCall[];
  /** Advance the injected clock (e.g. past the 60s health throttle window). */
  readonly advance: (ms: number) => void;
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: Handle;
  readonly role?: UserRole;
}

/** Insert a `users` row (the FK target for `user_credentials.ownerId`); returns its branded id. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.role ?? "x"}`);
  await db.insert(users).values({
    id,
    handle: castId<Handle>(overrides.handle ?? id),
    handleKey: handleKey(castId<Handle>(overrides.handle ?? id)),
    role: overrides.role ?? "user",
    enabled: true,
    passwordHash: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  return id;
}

/** Resolve a caller's Principal through the production row resolver; a passed role is first written onto the user's row. */
export async function principal(db: Db, userId: UserId, role?: UserRole): Promise<Principal> {
  return await makePrincipal({ db }, userId, { role });
}

/** Build the CredentialContext over a real db with the real SecretBox/guard + recording fake ops. */
export function makeHarness(db: Db): CredentialHarness {
  const clock = createFrozenClock(FROZEN_AT_MS);
  const audits: AuditCall[] = [];
  const ctx: CredentialContext = {
    db: databaseHandle(db),
    now: (): number => clock.now(),
    newCredentialId: (): UserCredentialId => nextCredentialId(),
    box: createSecretBox(TEST_KEY),
    findProvider: builtinProvider,
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    // PD user-bus lane: no-op recorder (this harness's tests don't assert the emit; persona's do).
    emitUserEvent: (): void => undefined,
  };

  return {
    ctx,
    audits,
    advance: (ms: number): void => {
      clock.advance(ms);
    },
  };
}

interface SeedCredentialOverrides {
  readonly ownerId?: string;
  readonly role?: UserRole;
  readonly provider?: CredentialView["provider"];
  readonly key?: string;
  readonly label?: string;
}

/** The evidence a real keyed resolve hands the auth-failure path: the credential it admitted and its witness. */
export async function executionEvidence(
  svc: CredentialsService,
  ownerId: UserId,
  credentialId: UserCredentialId,
  providerId: ProviderId,
): Promise<Extract<CredentialExecutionEvidence, { readonly credentialId: UserCredentialId }>> {
  const resolved = await svc.resolve({ ownerId, credentialId, providerId });
  if (resolved.credentialId === null) {
    throw new Error("a keyed resolve admitted no credential");
  }
  return { credentialId: resolved.credentialId, executionWitness: resolved.executionWitness };
}

/** The repeated "seed an owner, add one credential" arrange block (~15 call sites): builds the service
 *  over `h`, seeds a `user` owner, and adds one `openrouter` credential for it. */
export async function seedCredential(
  db: Db,
  h: CredentialHarness,
  overrides: SeedCredentialOverrides = {},
): Promise<{ svc: CredentialsService; owner: UserId; cred: CredentialView }> {
  const svc = createCredentialsService(h.ctx);
  const owner = await seedUser(db, {
    id: overrides.ownerId ?? "user_o",
    role: overrides.role ?? "user",
  });
  const cred = await svc.add({
    principal: await principal(db, owner),
    provider: overrides.provider ?? "openrouter",
    key: overrides.key ?? "k",
    ...(overrides.label !== undefined ? { label: overrides.label } : {}),
  });
  return { svc, owner, cred };
}
