// Boot delegates the guarded owner bootstrap to the identity owner; no Principal exists yet (D135).
import type { UserId } from "@orb/kit/ids";
import type { SeedOwnerParams } from "#domain/sessions";
import { createSeedOwner } from "#domain/sessions";

/** Ensure the configured owner through the trusted pre-compose identity operation. */
export function seedOwner(deps: SeedOwnerParams): Promise<readonly UserId[]> {
  return createSeedOwner(deps)();
}
