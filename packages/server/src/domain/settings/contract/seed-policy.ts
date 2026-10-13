// Settings owns seed completion and pointer picks; every operation retains the acting Principal.

import type { Principal } from "@orb/contracts/identity";
import type { UserSettings } from "@orb/contracts/settings";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { SettingsService } from "./service.ts";

export type SeedSettingsSource = Pick<SettingsService, "getUserSettings" | "updateUserSettingsSection">;
export interface PersonaSeedSettings {
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
  readonly markSeeded: (principal: Principal, seededPersonaId: PersonaId) => Promise<void>;
}
export type MarkWelcomeAssistant = (principal: Principal, characterId: CharacterId) => Promise<void>;
export type ReadDefaultPresetId = (principal: Principal) => Promise<UserSettings["seeds"]["defaultPresetId"]>;
