// Read the durable latch only after the seeder settles; an interrupted seed cannot claim completion.
import type { PersonaSeedCompletionDeps, SeedPersonaWithCompletion } from "../contract/seed-completion.ts";

export function createSeedPersonaWithCompletion(deps: PersonaSeedCompletionDeps): SeedPersonaWithCompletion {
  return async (principal): Promise<boolean> => {
    await deps.ensureSeeded(principal);
    return deps.isSeeded(principal);
  };
}
