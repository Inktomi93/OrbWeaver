// Per-user first-run seed of the default-character pack. At boot seeds the deployment owner once; new
// users get it via the app's first-authed-request hook, sharing this same seeder instance so the
// in-process memo + persisted onboarding latch make re-runs a no-op. `ensureSeeded` never throws.

import type { Principal } from "@orb/contracts/identity";
import type { DefaultCharacterSeeder } from "#domain/character";

export interface SeedDefaultCharactersDeps {
  /** Shared with the app first-request hook. */
  readonly seeder: DefaultCharacterSeeder;
  readonly owner: Principal;
}

/** Seed the default-character pack for the deployment owner (idempotent; never throws). */
export async function seedDefaultCharacters(deps: SeedDefaultCharactersDeps): Promise<void> {
  await deps.seeder.ensureSeeded(deps.owner);
}
