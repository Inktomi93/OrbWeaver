// Read the durable latch only after the seeder settles; an interrupted seed cannot claim completion.
import type { ContentSeedOp } from "@orb/contracts/settings";
import type { PersonaSeedCompletionDeps } from "../contract/seed-completion.ts";

export function createSeedPersonaWithCompletion(deps: PersonaSeedCompletionDeps): ContentSeedOp {
  return async (principal): Promise<boolean> => {
    await deps.ensureSeeded(principal);
    return deps.isSeeded(principal);
  };
}
