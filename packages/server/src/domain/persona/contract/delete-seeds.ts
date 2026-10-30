import type { Principal } from "@orb/contracts/identity";
import type { LoadUserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { PersonaSeedRepoint } from "./results.ts";

/** The deleting caller retains authority; persona can write only its two seed pointers. */

export interface PersonaDeleteSeedsDeps {
  readonly db: Db;
  readonly loadUserSettings: LoadUserSettings;
  readonly writeSeeds: (principal: Principal, seeds: Pick<PersonaSeedRepoint, "currentPersonaId" | "defaultPersonaId">) => Promise<void>;
}
