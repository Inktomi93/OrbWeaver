// Shared test harness for the preset domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db PresetContext with injected determinism (frozen clock + seeded ids) and a FAKE
// recording `audit` op — the sanctioned "fake at the edges, inject at the root" doctrine (testing §3): a
// real injected dep, not an internal-module mock. Seeds the `users` FK parent directly (presets.ownerId
// RESTRICT-references it); preset's OWN code never touches `users` (the no-direct-users-read chokepoint).

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { Handle, PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PresetContext } from "../../../../packages/server/src/domain/preset/context.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";
import { createSeededIds } from "../../../support/ids.ts";

export const FROZEN_AT = FROZEN_AT_MS;

interface AuditCall {
  readonly entry: Parameters<PresetContext["audit"]>[0];
  readonly at: number;
}

export interface PresetHarness {
  readonly ctx: PresetContext;
  readonly audits: AuditCall[];
}

/** Insert a `users` row (the FK parent for an owned preset); returns its branded id. Thin delegate over the
 *  canonical factory — preset's call sites pass a bare-string `handle` (the punchlist's warned variant). */
export async function seedUser(db: Db, handle = "owner"): Promise<UserId> {
  const id = castId<UserId>(`user_${handle}`);
  const seeded = await seedUserRow(db, { id, handle: castId<Handle>(handle) });
  return seeded.id;
}

interface SeedPresetOverrides {
  readonly id?: PresetId;
  readonly ownerId?: UserId | null;
  readonly name?: string;
  readonly kind?: string;
  readonly config?: PromptConfig;
  readonly schemaVersion?: number;
}

/** Insert a preset row directly (the read/list/update/delete fixtures). Defaults to an un-owned roleplay row. */
export async function seedPreset(db: Db, overrides: SeedPresetOverrides = {}): Promise<PresetId> {
  const id = overrides.id ?? castId<PresetId>(`preset_seed_${overrides.name ?? "x"}`);
  const config = overrides.config ?? DEFAULT_PROMPT_CONFIG;
  await db.insert(presets).values({
    id,
    ownerId: overrides.ownerId ?? null,
    name: overrides.name ?? "Roleplay",
    kind: overrides.kind ?? "roleplay",
    config,
    schemaVersion: overrides.schemaVersion ?? config.schemaVersion,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

/** Build the PresetContext over a real db with a frozen clock, seeded ids, and a recording audit fake. */
export function makeHarness(db: Db): PresetHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const ctx: PresetContext = {
    db,
    now: (): number => clock.now(),
    newPresetId: (): PresetId => castId<PresetId>(ids.next("preset")),
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    // PD user-bus lane: no-op recorder (this harness's tests don't assert the emit; persona's do).
    emitUserEvent: (): void => undefined,
  };
  return { ctx, audits };
}
