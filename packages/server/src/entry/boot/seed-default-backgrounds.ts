// Per-user first-run seed of the bundled SCENE PLATES. At boot seeds the deployment owner once; new users
// get it via the app's first-authed-request hook, sharing this same seeder instance so the in-process memo +
// persisted onboarding latch make re-runs a no-op. `ensureSeeded` never throws.
//
// IT RUNS BEFORE THE CARD AND EXAMPLE SEEDS, and the order is load-bearing on the LIBRARY, not on the refs:
// both packs dress through the same seeder's `resolvePlate`, which lifts the bytes on demand, so a card
// seeded first still gets a real owned asset. Running this one first is what makes the resulting
// `appearance.backgroundLibrary` come out in PACK ORDER rather than in the order the cards happened to ask.
//
// It also carries the `kind:"seeded"` retirement's DATA MIGRATION for this user (the seeder's own header
// states why the two are one pass): the rewrite can only point at plates the user already owns.

import type { Principal } from "@orb/contracts/identity";
import type { DefaultBackgroundSeeder } from "#domain/settings";

export interface SeedDefaultBackgroundsDeps {
  /** Shared with the app first-request hook. */
  readonly seeder: DefaultBackgroundSeeder;
  readonly owner: Principal;
}

/** Seed the bundled scene plates for the deployment owner (idempotent; never throws). */
export async function seedDefaultBackgrounds(deps: SeedDefaultBackgroundsDeps): Promise<void> {
  await deps.seeder.ensureSeeded(deps.owner);
}
