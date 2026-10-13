import type { Principal } from "@orb/contracts/identity";

export interface PersonaSeedCompletionDeps {
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
}
export type SeedPersonaWithCompletion = (principal: Principal) => Promise<boolean>;
