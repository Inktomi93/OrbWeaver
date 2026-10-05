import type { RpgStatProfile } from "@orb/contracts/rpg";
import { RPG_PROFILE_D20 } from "@orb/contracts/rpg";

/** Scores are assigned in the displayed D20 attribute order; individual cells remain editable. */
const D20_STANDARD_SCORES = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } as const;
const D20_ROLLED_RANGE = { min: 3, max: 18 } as const;

/** The standard array keyed by the ruleset's canonical vocabulary. */
export function standardD20Attributes(): Record<string, number> {
  return { ...D20_STANDARD_SCORES };
}

/** Roll on the server, dropping one lowest die per score; a failed roll commits no partial sheet. */
export async function rollD20Attributes(roll: () => Promise<readonly number[]>): Promise<Record<string, number>> {
  const attributes: Record<string, number> = {};
  for (const def of RPG_PROFILE_D20.attributes) {
    const dice = await roll();
    attributes[def.key] = dice.reduce((sum, face) => sum + face, 0) - Math.min(...dice);
  }
  return attributes;
}

/** Generation is offered only when this edited profile accepts the complete D20 score set. */
export function canGenerateD20Attributes(profile: RpgStatProfile): boolean {
  return (
    RPG_PROFILE_D20.attributes.every((def) => profile.attributes.some((entry) => entry.key === def.key)) &&
    profile.range.min <= D20_ROLLED_RANGE.min &&
    profile.range.max >= D20_ROLLED_RANGE.max
  );
}
