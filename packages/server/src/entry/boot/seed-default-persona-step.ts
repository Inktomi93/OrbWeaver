// entry/boot/seed-default-persona-step — boot step: seed the default "You" persona for the deployment owner
// (core/Tier-5-Entry.md §"Boot order"). Mirrors `seed-default-characters`: drives the ONE composition-root
// `DefaultPersonaSeeder` instance (shared with the app first-request hook via its in-process memo + the
// persisted `UserSettings.onboarding.defaultPersonaSeeded` latch, so re-runs + new-user seeding are no-ops).
// `ensureSeeded` never throws, so a seed failure never aborts boot.

import type { Principal } from "@orb/contracts/identity";
import type { DefaultPersonaSeeder } from "./seed-default-persona";

export interface SeedDefaultPersonaDeps {
  /** The composition-root seeder instance (shared with the app first-request hook). */
  readonly seeder: DefaultPersonaSeeder;
  /** The deployment owner Principal (the seed is scoped to `owner.userId`). */
  readonly owner: Principal;
}

/** Boot step: seed the default "You" persona for the deployment owner (idempotent; never throws). */
export async function seedDefaultPersona(deps: SeedDefaultPersonaDeps): Promise<void> {
  await deps.seeder.ensureSeeded(deps.owner);
}
