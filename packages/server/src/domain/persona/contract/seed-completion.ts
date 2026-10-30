import type { Principal } from "@orb/contracts/identity";
import type { DefaultPersonaSeeder } from "./default-seed.ts";

export interface PersonaSeedCompletionDeps {
  readonly ensureSeeded: DefaultPersonaSeeder["ensureSeeded"];
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
}
export type SeedPersonaWithCompletion = (principal: Principal) => Promise<boolean>;
