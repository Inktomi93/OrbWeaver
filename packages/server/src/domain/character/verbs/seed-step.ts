// The manifest records a card only when the real seeder resolved an authored handle into a row.

import type { Principal } from "@orb/contracts/identity";
import type { CharacterHandle } from "@orb/kit/ids";
import type { DefaultCharacterSeeder } from "../contract/seeder.ts";

export function createCharacterSeedStep(seedCard: DefaultCharacterSeeder["seedCard"], handle: CharacterHandle): (principal: Principal) => Promise<boolean> {
  return async (principal): Promise<boolean> => (await seedCard(principal, handle)) !== null;
}
