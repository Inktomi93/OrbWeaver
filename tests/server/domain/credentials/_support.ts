// Shared test harness for the credentials domain (NOT a test file — no `.test` suffix, so test-layout
// ignores it). Builds a real-db `CredentialContext` with: injected determinism (frozen clock + seeded
// ids), the REAL AES-256-GCM `SecretBox` over a known key (so the AAD round-trip + wrong-AAD failure are
// exercised for real, not mocked), and a `providerKnown` predicate over the built-in registry — the
// sanctioned "fake at the edges, inject at the root" doctrine (testing §3). Under connections-as-the-unit a
// credential is a sealed secret with a label: the probes/inspect/fetch-models ops LEFT this domain for the
// connection router (inference program §5.3), so there is nothing left here to fake but the audit recorder.

import type { CredentialHealth } from "../../../../packages/contracts/src/credentials/index.ts";
import type { Principal, UserRole } from "../../../../packages/contracts/src/identity/index.ts";
import { builtinProvider } from "../../../../packages/contracts/src/inference/index.ts";
import type { Db } from "../../../../packages/db/src/client/index.ts";
import { users } from "../../../../packages/db/src/schema/index.ts";
import type { Handle, UserCredentialId, UserId } from "../../../../packages/kit/src/ids/index.ts";
import { castId } from "../../../../packages/kit/src/ids/index.ts";
import type { CredentialContext } from "../../../../packages/server/src/domain/credentials/context.ts";
import type { CredentialView } from "../../../../packages/server/src/domain/credentials/contract/views.ts";
import type { CredentialsService } from "../../../../packages/server/src/domain/credentials/index.ts";
import { createCredentialsService } from "../../../../packages/server/src/domain/credentials/index.ts";
import { createSecretBox } from "../../../../packages/server/src/infra/crypto/secrets.ts";
import { createFrozenClock } from "../../../support/clock.ts";

const FROZEN_AT = 1_750_000_000_000;
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


/** A recorded `audit` op call (PD-142) — tests assert every credential mutation writes a durable row. */
interface AuditCall {
  readonly entry: Parameters<CredentialContext["audit"]>[0];
  readonly at: number;
}

/** The harness: the CredentialContext + the recorders/setters for the faked injected ops. */
export interface CredentialHarness {
  readonly ctx: CredentialContext;
  /** The recorded `audit` op calls (PD-142 — assert each mutation writes a durable audit row). */
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
    role: overrides.role ?? "user",
    enabled: true,
    passwordHash: null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

/** Build a Principal for a user id + role (cookie-resolved by default). */
export function principal(userId: UserId, role: UserRole = "user"): Principal {
  return { userId, role, handle: castId<Handle>(userId), externalId: null, via: "cookie" };
}

/** Build the CredentialContext over a real db with the real SecretBox/guard + recording fake ops. */
export function makeHarness(db: Db): CredentialHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const audits: AuditCall[] = [];
  const ctx: CredentialContext = {
    db,
    now: (): number => clock.now(),
    newCredentialId: (): UserCredentialId => nextCredentialId(),
    box: createSecretBox(TEST_KEY),
    providerKnown: (providerId: string): boolean => builtinProvider(providerId) !== undefined,
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
    principal: principal(owner),
    provider: overrides.provider ?? "openrouter",
    key: overrides.key ?? "k",
    ...(overrides.label !== undefined ? { label: overrides.label } : {}),
  });
  return { svc, owner, cred };
}
