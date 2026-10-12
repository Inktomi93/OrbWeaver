import type { Db } from "@orb/db";
import type { SettingsService } from "#domain/settings";

export interface PersonaDeleteSeedsDeps {
  readonly db: Db;
  readonly loadUserSettings: SettingsService["loadUserSettings"];
  readonly updateUserSettingsSection: SettingsService["updateUserSettingsSection"];
}
