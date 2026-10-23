// Settings fixtures share the owner's defaults and output parser; section patches cannot remove siblings.
import type { UserSettings, UserSettingsView } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS, USER_SETTINGS_SCHEMA_VERSION, userSettingsSchema, userSettingsViewSchema } from "@orb/contracts/settings";

import { createIdSource } from "@orb/kit/ids";
import { makeAppearanceSettings } from "./appearance-settings.ts";
import { makeDatabankSettings } from "./databank-settings.ts";
import { createSeededIds } from "./ids.ts";

const ids = createIdSource(createSeededIds().next);
const defaultUserId = ids.userId();

/** Overrides patch a section rather than replacing its complete contract value. */
export type UserSettingsOverrides = {
  readonly [K in keyof UserSettings]?: UserSettings[K] extends object ? Partial<UserSettings[K]> : UserSettings[K];
};

/** Builds a complete config through the same owner parser used for stored settings. */
export function userSettingsConfig(overrides: UserSettingsOverrides = {}): UserSettings {
  return userSettingsSchema.parse({
    ...DEFAULT_USER_SETTINGS,
    ...overrides,
    seeds: { ...DEFAULT_USER_SETTINGS.seeds, ...overrides.seeds },
    worldInfo: { ...DEFAULT_USER_SETTINGS.worldInfo, ...overrides.worldInfo },
    memory: { ...DEFAULT_USER_SETTINGS.memory, ...overrides.memory },
    databank: { ...DEFAULT_USER_SETTINGS.databank, ...overrides.databank, ...makeDatabankSettings(overrides.databank) },
    chat: { ...DEFAULT_USER_SETTINGS.chat, ...overrides.chat },
    library: { ...DEFAULT_USER_SETTINGS.library, ...overrides.library },
    imagery: { ...DEFAULT_USER_SETTINGS.imagery, ...overrides.imagery },
    prose: { ...DEFAULT_USER_SETTINGS.prose, ...overrides.prose },
    persona: { ...DEFAULT_USER_SETTINGS.persona, ...overrides.persona },
    groupDefaults: { ...DEFAULT_USER_SETTINGS.groupDefaults, ...overrides.groupDefaults },
    onboarding: { ...DEFAULT_USER_SETTINGS.onboarding, ...overrides.onboarding },
    workloads: { ...DEFAULT_USER_SETTINGS.workloads, ...overrides.workloads },
    profile: { ...DEFAULT_USER_SETTINGS.profile, ...overrides.profile },
    appearance: makeAppearanceSettings(overrides.appearance),
    theme: { ...DEFAULT_USER_SETTINGS.theme, ...overrides.theme },
  });
}

/** Builds the validated settings read envelope; caller identity may come from a persisted corpus user. */
export function userSettingsView(overrides: UserSettingsOverrides = {}, view: Partial<Omit<UserSettingsView, "config">> = {}): UserSettingsView {
  return userSettingsViewSchema.parse({
    userId: defaultUserId,
    schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
    updatedAt: 0,
    configUnreadable: null,
    ...view,
    config: userSettingsConfig(overrides),
  });
}

/** The production-default read of a never-touched account. */
