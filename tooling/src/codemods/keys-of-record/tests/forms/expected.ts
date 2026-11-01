import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import { keysOf } from "@orb/testkit/iso";

const SEEDS = keysOf(SEED_THEME_VALUE_SETS);
const FROZEN = [undefined, ...(keysOf(SEED_THEME_VALUE_SETS))] as const;
const PLAIN = Object.keys(SEED_THEME_VALUE_SETS);
const OTHER = Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof ELSEWHERE)[];
export { FROZEN, OTHER, PLAIN, SEEDS };
