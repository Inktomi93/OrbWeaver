import { keysOf, parseEvidence } from "@orb/testkit/iso";
import { BUTTON_BOX_OVERFLOW } from "@orb/ui/button/box-hit-area";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";

const SEEDS = keysOf(SEED_THEME_VALUE_SETS);
const FROZEN = [undefined, ...keysOf(SEED_THEME_VALUE_SETS)] as const;
const STEPS = keysOf(BUTTON_BOX_OVERFLOW.button).map((step) => BUTTON_BOX_OVERFLOW.button[step]);
export { FROZEN, parseEvidence, SEEDS, STEPS, TOKENS };
