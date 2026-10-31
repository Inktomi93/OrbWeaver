// Settings owns seed completion and pointer picks; every operation retains the acting Principal.

import type { MarkPersonaSeededOp, PersonaSeededOp } from "@orb/contracts/settings";
import type { SettingsService } from "./service.ts";

export type SeedSettingsSource = Pick<SettingsService, "getUserSettings" | "updateUserSettingsSection">;
export interface PersonaSeedSettings {
  readonly isSeeded: PersonaSeededOp;
  readonly markSeeded: MarkPersonaSeededOp;
}
