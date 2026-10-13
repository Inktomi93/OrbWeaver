// Onboarding latches and certificate projection stay settings facts; every mutation retains the acting Principal.
import type { SettingsComposedOps, SettingsComposedSource } from "../contract/composed-ops.ts";

export function createSettingsComposedOps(settings: SettingsComposedSource): SettingsComposedOps {
  return {
    certificateSetting: () => settings.getEffectiveConfig().ipCertificate,
    saveCertificateSetting: async (principal, setting): Promise<void> => {
      await settings.updateAppSettings({ principal, partial: { ipCertificate: setting } });
    },
    legacyLatches: async (principal): ReturnType<SettingsComposedOps["legacyLatches"]> => {
      const onboarding = (await settings.getUserSettings({ principal })).config.onboarding;
      return { characters: onboarding.defaultCharactersSeeded, persona: onboarding.defaultPersonaSeeded };
    },
    personaSeeded: async (principal) => (await settings.getUserSettings({ principal })).config.onboarding.defaultPersonaSeeded,
    isExamplePluginSeeded: async (principal) => (await settings.getUserSettings({ principal })).config.onboarding.examplePluginsSeeded,
    markExamplePluginSeeded: async (principal): Promise<void> => {
      await settings.updateUserSettingsSection({ principal, input: { section: "onboarding", patch: { examplePluginsSeeded: true } } });
    },
    readSeededPluginVersions: async (principal) => (await settings.getUserSettings({ principal })).config.onboarding.seededPluginVersions,
    writeSeededPluginVersions: async (principal, versions): Promise<void> => {
      await settings.updateUserSettingsSection({ principal, input: { section: "onboarding", patch: { seededPluginVersions: { ...versions } } } });
    },
    isDistributedPluginApplied: async (principal) => (await settings.getUserSettings({ principal })).config.onboarding.distributedPluginsApplied,
    markDistributedPluginApplied: async (principal): Promise<void> => {
      await settings.updateUserSettingsSection({ principal, input: { section: "onboarding", patch: { distributedPluginsApplied: true } } });
    },
  };
}
