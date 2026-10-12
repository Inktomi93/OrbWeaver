import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { SettingsService } from "#domain/settings";
import type { PersonaSeedRepoint } from "./results.ts";

/** The deleting caller retains authority; persona can write only its two seed pointers. */
export interface PersonaDeleteSeedsDeps {
  readonly db: Db;
  readonly loadUserSettings: SettingsService["loadUserSettings"];
  readonly writeSeeds: (principal: Principal, seeds: Pick<PersonaSeedRepoint, "currentPersonaId" | "defaultPersonaId">) => Promise<void>;
}
