// Shared test harness for the admin domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db AdminContext with injected determinism (frozen clock + seeded ids) and FAKE
// injected ports/ops (audit/hashPassword/sessions/vllm) — the sanctioned "fake at the edges, inject at the
// root" doctrine (testing §3): these are real injected deps, not internal-module mocks. The fakes RECORD
// their calls so tests assert the verb's behaviour (e.g. existence-before-audit: zero recorded audits).

import type { Principal, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AdminContext } from "../../../../packages/server/src/domain/admin/contract/service.ts";
import type {
  AdminEngineStatus,
  SessionAdminView,
} from "../../../../packages/server/src/domain/admin/contract/views.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { createSeededIds } from "../../../support/ids.ts";

interface AuditCall {
  readonly entry: Parameters<AdminContext["audit"]>[0];
  readonly at: number;
}

/** The harness: the AdminContext + the recorders the fakes write to. */
export interface AdminHarness {
  readonly ctx: AdminContext;
  readonly audits: AuditCall[];
  readonly revokedAll: UserId[];
  readonly revokedSessions: string[];
  readonly restarted: string[];
  /** Make the fake vllm `restartEngine` reject (to exercise the error-translation path). */
  readonly setRestartError: (err: unknown) => void;
}

const FROZEN_AT = 1_750_000_000_000;

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: string;
  readonly role?: UserRole;
  readonly enabled?: boolean;
  readonly passwordHash?: string | null;
}

/** Insert a `users` row with deterministic defaults; returns its branded id. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? overrides.role ?? "x"}`);
  await db.insert(users).values({
    id,
    handle: castId<Handle>(overrides.handle ?? id),
    role: overrides.role ?? "user",
    enabled: overrides.enabled ?? true,
    passwordHash: overrides.passwordHash ?? null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

/** Build a Principal for a given user id + role (cookie-resolved by default). */
export function principal(userId: UserId, role: UserRole, handle: string = userId): Principal {
  return {
    userId,
    role,
    handle: castId<Handle>(handle),
    externalId: null as ExternalId | null,
    via: "cookie",
  };
}

/** Build the AdminContext over a real db with deterministic + recording fakes. */
export function makeHarness(db: Db): AdminHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const revokedAll: UserId[] = [];
  const revokedSessions: string[] = [];
  const restarted: string[] = [];
  let restartError: unknown;
  const sessionList: SessionAdminView[] = [];
  const engineStatuses: Record<string, AdminEngineStatus> = {
    chat: { status: "owned", detail: "ok", updatedAt: FROZEN_AT },
  };

  const ctx: AdminContext = {
    db,
    now: (): number => clock.now(),
    newUserId: (): UserId => castId<UserId>(ids.next("user")),
    hashPassword: (plain: string): Promise<string> => Promise.resolve(`scrypt$test$${plain}`),
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    sessions: {
      listForUser: (_userId: UserId): Promise<readonly SessionAdminView[]> =>
        Promise.resolve(sessionList),
      revoke: (sessionId: string): Promise<void> => {
        revokedSessions.push(sessionId);
        return Promise.resolve();
      },
      revokeAllForUser: (userId: UserId): Promise<number> => {
        revokedAll.push(userId);
        return Promise.resolve(revokedAll.length);
      },
    },
    vllm: {
      allEngineStatuses: (): Record<string, AdminEngineStatus> => engineStatuses,
      restartEngine: (engine: string): Promise<string> => {
        if (restartError !== undefined) {
          return Promise.reject(restartError);
        }
        restarted.push(engine);
        return Promise.resolve(`restarting ${engine}`);
      },
    },
  };

  return {
    ctx,
    audits,
    revokedAll,
    revokedSessions,
    restarted,
    setRestartError: (err: unknown): void => {
      restartError = err;
    },
  };
}
