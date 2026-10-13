// Settings owns library/latch writes and orders every table owner's legacy rewrite at one injected instant.

import type { BackgroundSeedSettings, SeedBackgroundRewriteDeps } from "../contract/background-seed-ops.ts";
import type { SeedSettingsSource } from "../contract/seed-policy.ts";
import type { DefaultBackgroundSeederDeps } from "../contract/seeder.ts";
import { migrateSeededBackgroundPicks } from "../persistence/migrate-seeded-background-picks.ts";

export function createBackgroundSeedSettings(settings: SeedSettingsSource): BackgroundSeedSettings {
  return {
    readOnboarding: async (principal) => ({ seeded: (await settings.getUserSettings({ principal })).config.onboarding.defaultBackgroundsSeeded }),
    readLibrary: async (principal) => (await settings.getUserSettings({ principal })).config.appearance.backgroundLibrary,
    writeLibrary: async (principal, library): Promise<void> => {
      await settings.updateUserSettingsSection({
        principal,
        input: { section: "appearance", patch: { backgroundLibrary: library.map((entry) => ({ ...entry })) } },
      });
    },
    markSeeded: async (principal): Promise<void> => {
      await settings.updateUserSettingsSection({ principal, input: { section: "onboarding", patch: { defaultBackgroundsSeeded: true } } });
    },
  };
}

export function createSeedBackgroundRewriter(deps: SeedBackgroundRewriteDeps): DefaultBackgroundSeederDeps["rewriteSeededReferences"] {
  return async (userId, resolve): Promise<number> => {
    const at = deps.now();
    const picks = await migrateSeededBackgroundPicks(deps.db, userId, resolve, at);
    const cards = await deps.migrateCards(userId, resolve, at);
    const rooms = await deps.migrateRooms(userId, resolve, at);
    return picks + cards + rooms;
  };
}
