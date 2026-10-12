// The boot step for the example-plugin seeder: seed the
// deployment owner once at boot; every other user is seeded by the app's first-authed-request hook through
// the SAME instance. Idempotent; never throws.

import type { Principal } from "@orb/contracts/identity";
import type { ExamplePluginSeeder } from "./seed-example-plugins.ts";

// @orb-waive no-inline-package-interface(SeedExamplePluginsDeps): baselined when the gate landed; burn-down item 952.
export interface SeedExamplePluginsDeps {
  /** Shared with the app first-request hook. */
  readonly seeder: ExamplePluginSeeder;
  readonly owner: Principal;
}

/** Seed the bundled example plugins for the deployment owner (idempotent; never throws). */
export async function seedExamplePlugins(deps: SeedExamplePluginsDeps): Promise<void> {
  await deps.seeder.ensureSeeded(deps.owner);
}
