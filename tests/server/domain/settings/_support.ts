// Shared test harness for the settings domain (NOT a test file — no `.test` suffix, so test-layout
// ignores it). Builds a real-db `SettingsServiceDeps` with the REAL injected admin guard ops
// (`requireAdmin`/`requireOwner` — pure, Principal-based) so the gate tests assert the ACTUAL owner∪admin
// vs owner-only split, plus a recording `audit` fake (the sanctioned "fake at the edges, inject at the
// root" doctrine). The frozen clock is the determinism seam (no ambient wall-clock reads).

import type { Principal, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle, ThemeId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireAdmin, requireOwner } from "@orb/server/domain/admin";
import type { SettingsServiceDeps } from "@orb/server/domain/settings";
import { createSettingsService } from "@orb/server/domain/settings";
import type { AuditEntry } from "@orb/server/foundation/observability";
import { createFrozenClock } from "../../../support/clock.ts";

export const FROZEN_AT = 1_750_000_000_000;

interface AuditCall {
  readonly entry: AuditEntry;
  readonly at: number;
}

export interface SettingsHarness {
  readonly svc: ReturnType<typeof createSettingsService>;
  readonly deps: SettingsServiceDeps;
  readonly audits: AuditCall[];
  readonly clock: ReturnType<typeof createFrozenClock>;
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: string;
  readonly role?: UserRole;
}

/** Insert a `users` row (the `user_settings` FK requires it). */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? overrides.role ?? "x"}`);
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

/** `via` is always `"cookie"` (hardcoded, not a param). */
export function principal(userId: UserId, role: UserRole, handle: string = userId): Principal {
  return {
    userId,
    role,
    handle: castId<Handle>(handle),
    externalId: null as ExternalId | null,
    via: "cookie",
  };
}

export function makeHarness(db: Db): SettingsHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const audits: AuditCall[] = [];
  let themeCounter = 0;
  const deps: SettingsServiceDeps = {
    db,
    now: (): number => clock.now(),
    audit: (entry: AuditEntry, at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    requireAdmin,
    requireOwner,
    newThemeId: (): ThemeId => {
      themeCounter += 1;
      return castId<ThemeId>(`theme_test${themeCounter}`);
    },
    // PD user-bus lane: no-op recorder (this harness's tests don't assert the emit; persona's do).
    emitUserEvent: (): void => undefined,
  };
  return { svc: createSettingsService(deps), deps, audits, clock };
}
