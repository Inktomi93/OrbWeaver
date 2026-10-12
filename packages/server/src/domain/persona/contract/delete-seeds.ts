import type { Principal } from "@orb/contracts/identity";
import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { PersonaSeedRepoint } from "./results.ts";

/** The deleting caller retains authority; persona can write only its two seed pointers. */

export interface PersonaDeleteSeedsDeps {
  readonly db: Db;
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
  readonly writeSeeds: (principal: Principal, seeds: Pick<PersonaSeedRepoint, "currentPersonaId" | "defaultPersonaId">) => Promise<void>;
}
