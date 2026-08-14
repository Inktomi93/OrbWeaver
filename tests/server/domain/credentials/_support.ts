// Shared test harness for the credentials domain (NOT a test file — no `.test` suffix, so test-layout
// ignores it). Builds a real-db `CredentialContext` with: injected determinism (frozen clock + seeded
// ids), the REAL AES-256-GCM `SecretBox` over a known key (so the AAD round-trip + wrong-AAD failure are
// exercised for real, not mocked), the REAL `requireOwner` guard (so the owner-gate is the production
// one), and FAKE recording provider/network ops (probe/probeEndpoint/inspect/fetchModels) — the sanctioned "fake at the
// edges, inject at the root" doctrine (testing §3). The fakes RECORD their calls so tests assert behavior.

import type { CredentialHealth, ResolvedCredential } from "../../../../packages/contracts/src/credentials/index.ts";
import type { Principal, UserRole } from "../../../../packages/contracts/src/identity/index.ts";
import type { EndpointInspection } from "../../../../packages/contracts/src/providers/index.ts";
import type { Db } from "../../../../packages/db/src/client/index.ts";
import { users } from "../../../../packages/db/src/schema/index.ts";
import type { Handle, UserCredentialId, UserId } from "../../../../packages/kit/src/ids/index.ts";
import { castId } from "../../../../packages/kit/src/ids/index.ts";
import { requireOwner } from "../../../../packages/server/src/domain/admin/index.ts";
import type { CredentialContext } from "../../../../packages/server/src/domain/credentials/context.ts";
import type { FetchModelsArgs } from "../../../../packages/server/src/domain/credentials/contract/service.ts";
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

interface InspectCall {
  readonly credential: ResolvedCredential;
  readonly model: string;
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
  /** Credentials handed to the faked `probe` op (testHealth's openrouter arm). */
  readonly probed: ResolvedCredential[];
  readonly setProbeResult: (result: CredentialHealth) => void;
  /** Endpoint coordinates handed to the faked `probeEndpoint` op (testHealth's custom_openai arm). */
  readonly endpointProbes: FetchModelsArgs[];
  readonly setEndpointProbeResult: (result: CredentialHealth) => void;
  /** Args handed to the faked `inspect` op. */
  readonly inspected: InspectCall[];
  /** Args handed to the faked `fetchModels` op. */
  readonly fetched: FetchModelsArgs[];
  readonly setModels: (models: string[]) => void;
  readonly setInspectResult: (result: EndpointInspection) => void;
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
  const probed: ResolvedCredential[] = [];
  const endpointProbes: FetchModelsArgs[] = [];
  const inspected: InspectCall[] = [];
  const fetched: FetchModelsArgs[] = [];
  let probeResult: CredentialHealth = { status: "ok", checkedAt: FROZEN_AT };
  let endpointProbeResult: CredentialHealth = { status: "ok", checkedAt: FROZEN_AT };
  let models: string[] = [];
  let inspectResult: EndpointInspection = {
    ok: true,
    request: { url: "https://example.test/v1/chat/completions", headers: {}, body: "{}" },
    response: { status: 200, statusText: "OK", bodyPreview: "{}" },
  };

  const ctx: CredentialContext = {
    db,
    now: (): number => clock.now(),
    newCredentialId: (): UserCredentialId => nextCredentialId(),
    box: createSecretBox(TEST_KEY),
    requireOwner,
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    probe: (credential: ResolvedCredential): Promise<CredentialHealth> => {
      probed.push(credential);
      return Promise.resolve(probeResult);
    },
    probeEndpoint: (args: FetchModelsArgs): Promise<CredentialHealth> => {
      endpointProbes.push(args);
      return Promise.resolve(endpointProbeResult);
    },
    inspect: (req: InspectCall): Promise<EndpointInspection> => {
      inspected.push(req);
      return Promise.resolve(inspectResult);
    },
    fetchModels: (args: FetchModelsArgs): Promise<string[]> => {
      fetched.push(args);
      return Promise.resolve(models);
    },
    // PD user-bus lane: no-op recorder (this harness's tests don't assert the emit; persona's do).
    emitUserEvent: (): void => undefined,
  };

  return {
    ctx,
    audits,
    probed,
    setProbeResult: (result: CredentialHealth): void => {
      probeResult = result;
    },
    endpointProbes,
    setEndpointProbeResult: (result: CredentialHealth): void => {
      endpointProbeResult = result;
    },
    inspected,
    fetched,
    setModels: (next: string[]): void => {
      models = next;
    },
    setInspectResult: (result: EndpointInspection): void => {
      inspectResult = result;
    },
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
