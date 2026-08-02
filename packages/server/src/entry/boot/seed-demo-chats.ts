// Per-user first-run seed of the bundled EXAMPLE conversations. The exact mirror of
// `seed-default-characters.ts`: at boot it seeds the deployment owner once, new users get it via the app's
// first-authed-request hook, and both share the ONE seeder instance so the in-process memo + the persisted
// `onboarding.demoChatsSeeded` latch make re-runs a no-op. `ensureSeeded` never throws.
//
// ORDER IS LOAD-BEARING: this runs AFTER `seedDefaultCharacters` — every example attaches to seeded cards,
// and a handle that is not in the library yet skips that example rather than seeding a cast-less room.

import type { Principal } from "@orb/contracts/identity";
import type { DemoChatSeeder } from "#domain/chat";

export interface SeedDemoChatsDeps {
  /** Shared with the app first-request hook. */
  readonly seeder: DemoChatSeeder;
  readonly owner: Principal;
}

/** Seed the bundled example conversations for the deployment owner (idempotent; never throws). */
export async function seedDemoChats(deps: SeedDemoChatsDeps): Promise<void> {
  await deps.seeder.ensureSeeded(deps.owner);
}
