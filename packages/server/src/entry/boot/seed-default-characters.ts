// entry/boot/seed-default-characters — boot step 4: the default-character pack (core/Tier-5-Entry.md §"Boot order").
//
// Per-USER first-run seed, same precedent as `seedCredentialFromEnv` (the env→OpenRouter key) but for the
// authored card pack. At boot it seeds the DEPLOYMENT OWNER once (single-user "it just works"); new users
// (SSO first login, admin-created accounts) get the pack via the app's first-authed-request hook
// (`entry/app.ts`), which shares THIS same seeder instance (its in-process memo + the persisted
// `UserSettings.onboarding.defaultCharactersSeeded` latch make re-runs a no-op). The seeder is constructed in
// the composition root over the real `character.create` path + the injected settings latch ops; this step
// just drives it for the owner. `ensureSeeded` never throws (it logs + retries on the next touch), so a seed
// failure never aborts boot.

import type { Principal } from "@orb/contracts/identity";
import type { DefaultCharacterSeeder } from "#domain/character";

export interface SeedDefaultCharactersDeps {
  /** The composition-root seeder instance (shared with the app first-request hook). */
  readonly seeder: DefaultCharacterSeeder;
  /** The deployment owner Principal (the seed is scoped to `owner.userId`). */
  readonly owner: Principal;
}

/** Boot step 4: seed the default-character pack for the deployment owner (idempotent; never throws). */
export async function seedDefaultCharacters(deps: SeedDefaultCharactersDeps): Promise<void> {
  await deps.seeder.ensureSeeded(deps.owner);
}
