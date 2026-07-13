// Mirrors seed-default-characters: seed the default "You" persona for the deployment owner.

import type { Principal } from "@orb/contracts/identity";
import type { DefaultPersonaSeeder } from "./seed-default-persona";

export interface SeedDefaultPersonaDeps {
  /** Shared with the app first-request hook. */
  readonly seeder: DefaultPersonaSeeder;
  readonly owner: Principal;
}

/** Seed the default "You" persona for the deployment owner (idempotent; never throws). */
export async function seedDefaultPersona(deps: SeedDefaultPersonaDeps): Promise<void> {
  await deps.seeder.ensureSeeded(deps.owner);
}
