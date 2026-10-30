import type { PersonaSeededOp } from "@orb/contracts/settings";
import type { DefaultPersonaSeeder } from "./default-seed.ts";

export interface PersonaSeedCompletionDeps {
  readonly ensureSeeded: DefaultPersonaSeeder["ensureSeeded"];
  readonly isSeeded: PersonaSeededOp;
}
