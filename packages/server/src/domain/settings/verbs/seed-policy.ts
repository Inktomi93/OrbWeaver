// Null-only seed picks retain explicit choices; the completion latch lands after the pointers.

import type { PersonaId } from "@orb/kit/ids";
import type { MarkWelcomeAssistant, PersonaSeedSettings, ReadDefaultPresetId, SeedSettingsSource } from "../contract/seed-policy.ts";

export function createPersonaSeedSettings(settings: SeedSettingsSource): PersonaSeedSettings {
  return {
    isSeeded: async (principal): Promise<boolean> => (await settings.getUserSettings({ principal })).config.onboarding.defaultPersonaSeeded,
    markSeeded: async (principal, seededPersonaId): Promise<void> => {
      // POINTERS FIRST, LATCH LAST: an interruption leaves the seed retryable so its artifact heals the pointers.
      // This remains a check-then-act read/write. A concurrent explicit pick between them can still lose;
      // relocation does not provide the conditional section write needed to close that existing race.
      const current = (await settings.getUserSettings({ principal })).config;
      const patch: { defaultPersonaId?: PersonaId; currentPersonaId?: PersonaId } = {};
      if (current.seeds.defaultPersonaId === null) {
        patch.defaultPersonaId = seededPersonaId;
      }
      if (current.seeds.currentPersonaId === null) {
        patch.currentPersonaId = seededPersonaId;
      }
      if (Object.keys(patch).length > 0) {
        await settings.updateUserSettingsSection({ principal, input: { section: "seeds", patch } });
      }
      await settings.updateUserSettingsSection({ principal, input: { section: "onboarding", patch: { defaultPersonaSeeded: true } } });
    },
  };
}

export function createMarkWelcomeAssistant(settings: SeedSettingsSource): MarkWelcomeAssistant {
  return async (principal, welcomeAssistantId): Promise<void> => {
    const current = (await settings.getUserSettings({ principal })).config;
    if (current.seeds.welcomeAssistantCharacterId === null) {
      await settings.updateUserSettingsSection({ principal, input: { section: "seeds", patch: { welcomeAssistantCharacterId: welcomeAssistantId } } });
    }
  };
}

export function createReadDefaultPresetId(settings: SeedSettingsSource): ReadDefaultPresetId {
  return async (principal) => (await settings.getUserSettings({ principal })).config.seeds.defaultPresetId;
}
