// Shared test harness for the settings domain (NOT a test file — no `.test` suffix, so test-layout
// ignores it). Builds a real-db `SettingsServiceDeps` with the REAL injected admin guard ops
// (`requireAdmin`/`requireOwner` — pure, Principal-based) so the gate tests assert the ACTUAL owner∪admin
// vs owner-only split, plus a recording `audit` fake (the sanctioned "fake at the edges, inject at the
// root" doctrine). The frozen clock is the determinism seam (no ambient wall-clock reads).

import type { Principal, UserRole } from "@orb/contracts/identity";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle, ThemeId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireAdmin, requireOwner } from "@orb/server/domain/admin";
import type { SettingsServiceDeps, ThemeView } from "@orb/server/domain/settings";
import { createSettingsService } from "@orb/server/domain/settings";
import type { AuditEntry } from "@orb/server/foundation/observability";
import type { Mock } from "vitest";
import { vi } from "vitest";
import { createFrozenClock } from "../../../support/clock.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";

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
  /** PD-139a recorder: asserts an embed/imageEmbed model change enqueued the reindex (once), and a routing
   *  patch that doesn't touch those ids does NOT. */
  readonly onEmbedModelChanged: Mock<() => void>;
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

/** Build a Principal for a given user id + role (cookie-resolved by default). Delegates to the shared
 *  `support/factories/principal` — settings keeps the positional `(id, role, handle?)` convention its
 *  call sites use; the shared home owns the literal (role/handle over the `overrides` axis). */
export function principal(userId: UserId, role: UserRole, handle: string = userId): Principal {
  return makePrincipal(userId, { role, handle: castId<Handle>(handle) });
}

export function makeHarness(db: Db, overrides: { readonly materializeBackground?: MaterializeBackgroundOp } = {}): SettingsHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const audits: AuditCall[] = [];
  const onEmbedModelChanged: Mock<() => void> = vi.fn<() => void>();
  let themeCounter = 0;
  let entryCounter = 0;
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
    onEmbedModelChanged,
    // F-P0-2: default refuses (never hit by non-background tests); addExternalBackground tests inject a stub.
    materializeBackground:
      overrides.materializeBackground ?? ((): ReturnType<MaterializeBackgroundOp> => Promise.resolve({ ok: false, reason: "unreachable" })),
    newBackgroundEntryId: (): string => {
      entryCounter += 1;
      return `bg_entry_${entryCounter}`;
    },
  };
  return { svc: createSettingsService(deps), deps, audits, clock, onEmbedModelChanged };
}

/** Find a seed theme by name in `ownerId`'s readable set (own ∪ seeds) — the
 *  `ensureSeedThemes` + `listThemes` + find + not-undefined-guard block 5 theme-verb tests repeated. Throws
 *  if the name isn't found (a seed lookup that misses is a test-setup bug, not a case to assert on). */
export async function findSeedTheme(h: SettingsHarness, ownerId: UserId, name: string): Promise<ThemeView> {
  const views = await h.svc.listThemes({ principal: principal(ownerId, "user") });
  const found = views.find((v) => v.name === name);
  if (found === undefined) {
    throw new Error(`seed theme not found: ${name}`);
  }
  return found;
}
