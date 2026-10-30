import type { Principal } from "@orb/contracts/identity";
import type { PersonaSeededOp } from "@orb/contracts/settings";
import type { DefaultPersonaSeeder } from "./default-seed.ts";

export interface PersonaSeedCompletionDeps {
  readonly ensureSeeded: DefaultPersonaSeeder["ensureSeeded"];
  readonly isSeeded: PersonaSeededOp;
}
export type SeedPersonaWithCompletion = (principal: Principal) => Promise<boolean>;
