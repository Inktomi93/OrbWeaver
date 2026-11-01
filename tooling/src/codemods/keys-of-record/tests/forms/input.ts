import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";

const SEEDS = Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[];
const FROZEN = [undefined, ...(Object.keys(SEED_THEME_VALUE_SETS) as readonly (keyof typeof SEED_THEME_VALUE_SETS)[])] as const;
const PLAIN = Object.keys(SEED_THEME_VALUE_SETS);
const OTHER = Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof ELSEWHERE)[];
export { FROZEN, OTHER, PLAIN, SEEDS };
